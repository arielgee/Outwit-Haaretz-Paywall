"use strict";

let OHP = (function () {

	const HOST_HAARETZ = "https://www.haaretz.co.il";
	const HOST_THEMARKER = "https://www.themarker.com";

	const COMMON_RX_PATTERN = "^({$$}/)(.*)(\\d\\.\\d+)(\\?.*)?$";

	const RX_HAARETZ = new RegExp(COMMON_RX_PATTERN.replace("{$$}", HOST_HAARETZ), "i");
	const RX_THEMARKER = new RegExp(COMMON_RX_PATTERN.replace("{$$}", HOST_THEMARKER), "i");

	const URL_CDN_HRTZ = "https://www-haaretz-co-il.cdn.ampproject.org/v/s/www.haaretz.co.il/amp/";
	const URL_CDN_MRKR = "https://www-themarker-com.cdn.ampproject.org/v/s/www.themarker.com/amp/";

	const QUERY_STRING_CDN = "?amp_js_v=0.1";

	const HRTZ_REPLACEMENT = `${URL_CDN_HRTZ}$3${QUERY_STRING_CDN}`;
	const MRKR_REPLACEMENT = `${URL_CDN_MRKR}$3${QUERY_STRING_CDN}`;

	const HRTZ_REVERT_REPLACEMENT = `${HOST_HAARETZ}/`;
	const MRKR_REVERT_REPLACEMENT = `${HOST_THEMARKER}/`;


	const WEB_REQUEST_FILTER = {
		urls: [
			HOST_HAARETZ + "/*/*",
			HOST_THEMARKER + "/*/*",
			URL_CDN_HRTZ + "*",
			URL_CDN_MRKR + "*",
		],
		types: [ "main_frame" ]
	};

	const TABS_ON_UPDATED_FILTER = {
		urls: [
			URL_CDN_HRTZ + "*",
			URL_CDN_MRKR + "*",
		],
		properties: [ "status" ]
	};


	const BROWSER_ACTION_TITLE = browser.runtime.getManifest().browser_action.default_title;
	const OHP_STATE = {
		enabled: {
			id: 0,
			title: BROWSER_ACTION_TITLE + " - Enabled",
			icon: "/icons/outwit.svg",
		},
		ignoreNextRequest: {
			id: 1,
			title: BROWSER_ACTION_TITLE + " - Ignore Next",
			icon: "/icons/outwit-ignore-next.svg",
		},
		revertNextRequest: {
			id: 2,
			title: BROWSER_ACTION_TITLE + " - Revert Next",
			icon: "/icons/outwit-revert-next.svg",
		},
		disabled: {
			id: 3,
			title: BROWSER_ACTION_TITLE + " - Disabled",
			icon: "/icons/outwit-disabled.svg",
		},

		// pseudo states
		lowerBound: { id: 0 },
		upperBound: { id: 3 },
	}


	const CSS_RULES_PRETTY_PAGE =	"html:not([amp4ads]) body {" +
										"margin-right: 15% !important;" +
										"margin-left: 40% !important;" +
										"font-size: 100% !important;" +
									"}";

	const JS_SEND_MSG_REVERT_TAB =	"document.addEventListener('keydown', async (e) => {" +
										"if(e.ctrlKey && e.altKey && e.code === 'KeyR') {" +
											"browser.runtime.sendMessage({" +
												"id: 'msg_revertThisTab'," +
												"tabId: $1," +
											"});" +
										"}" +
									"});";

	const MAX_MAP_REDIRECTED_URLS_ENTRIES = 300;

	let m_ohpStateId = -1;
	let m_mapRedirectedUrls = new Map();
	let m_disabledTabs = [];
	let m_webRequestIdToIgnore = 0;


	initialization();

	////////////////////////////////////////////////////////////////////////////////////
	async function initialization() {

		printLogHelp();

		createMenus();
		handleBrowserButtonPopup();
		setOHPState(await getPreferenceValue("pref_stateId", OHP_STATE.enabled.id));
		browser.runtime.onMessage.addListener(onRuntimeMessage);
		browser.browserAction.onClicked.addListener(onBrowserActionClicked);
		browser.menus.onShown.addListener(onMenusShown);
		browser.menus.onClicked.addListener(onMenusClicked);
		browser.commands.onCommand.addListener(onCommands);
	}


	////////////////////////////////////////////////////////////////////////////////////
	//////////  E  V  E  N  T     L  I  S  T  E  N  E  R  S  ///////////////////////////
	////////////////////////////////////////////////////////////////////////////////////

	////////////////////////////////////////////////////////////////////////////////////
	function onRuntimeMessage(message) {

		switch(message.id) {

			case "msg_getOHPStateId":
				return Promise.resolve({ ohpStateId: m_ohpStateId });
				//////////////////////////////////////////////

			case "msg_setOHPStateId":
				setOHPState(message.ohpStateId);
				break;
				//////////////////////////////////////////////

			case "msg_revertThisTab":
				setOHPState(OHP_STATE.revertNextRequest.id);
				browser.tabs.reload(message.tabId);
				break;
				//////////////////////////////////////////////
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onBrowserActionClicked(tab) {
		setOHPState(m_ohpStateId+1 > OHP_STATE.upperBound.id ? OHP_STATE.lowerBound.id : m_ohpStateId+1);
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onMenusShown(info, tab) {

		if( tab.url.startsWith(HOST_HAARETZ) || tab.url.startsWith(HOST_THEMARKER) ) {

			browser.menus.update("mnu-revert-tab", { visible: false });
			browser.menus.update("mnu-disable-for-this-tab", { visible: true, checked: m_disabledTabs.includes(`${tab.windowId}.${tab.id}`) });

		} else if( tab.url.startsWith(URL_CDN_HRTZ) || tab.url.startsWith(URL_CDN_MRKR) ) {

			browser.menus.update("mnu-revert-tab", { visible: true });
			browser.menus.update("mnu-disable-for-this-tab", { visible: false });

		} else {

			browser.menus.update("mnu-revert-tab", { visible: false });
			browser.menus.update("mnu-disable-for-this-tab", { visible: false });
		}

		browser.menus.refresh();
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onMenusClicked(info, tab) {

		switch (info.menuItemId) {

			case "mnu-revert-tab":
				setOHPState(OHP_STATE.revertNextRequest.id);
				browser.tabs.reload(tab.id);
				break;
				//////////////////////////////////////////////

			case "mnu-disable-for-this-tab":
				if(info.checked) {
					m_disabledTabs.push(`${tab.windowId}.${tab.id}`);
				} else {
					let idx = m_disabledTabs.indexOf(`${tab.windowId}.${tab.id}`);
					if(idx > -1) {
						m_disabledTabs.splice(idx, 1);
					}
				}
				break;
				//////////////////////////////////////////////
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onCommands(command) {

		browser.runtime.sendMessage({ id: "msg_closePopupIfOpen" }).catch(() => {});

		switch (command) {
			case "state-enable":			setOHPState(OHP_STATE.enabled.id);				break;
			case "state-ignore-next-req":	setOHPState(OHP_STATE.ignoreNextRequest.id);	break;
			case "state-revert-next-req":	setOHPState(OHP_STATE.revertNextRequest.id);	break;
			case "state-disable":			setOHPState(OHP_STATE.disabled.id);				break;
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onWebRequestHeadersReceived(details) {

		return new Promise(async (resolve) => {

			let objResolved = {};

			let windowInfo = await browser.windows.getCurrent();

			if(m_disabledTabs.includes(`${windowInfo.id}.${details.tabId}`)) {

				resolve(objResolved);

			} else if(details.statusCode === 200 || m_ohpStateId === OHP_STATE.revertNextRequest.id) {

				if(m_ohpStateId === OHP_STATE.ignoreNextRequest.id) {

					m_ohpStateId = OHP_STATE.enabled.id;
					handleBrowserButtonStateUI();

				} else if(m_ohpStateId === OHP_STATE.revertNextRequest.id) {

					let redirectUrl = getRedirectUrlToHost(details.url);

					if( !!redirectUrl && redirectUrl !== details.url ) {
						objResolved["redirectUrl"] = redirectUrl;
						m_webRequestIdToIgnore = details.requestId;
					}

					m_ohpStateId = OHP_STATE.enabled.id;
					handleBrowserButtonStateUI();

				} else if(m_ohpStateId === OHP_STATE.enabled.id && m_webRequestIdToIgnore !== details.requestId) {

					let redirectUrl = getRedirectUrlToCDN(details.url);

					if( !!redirectUrl && redirectUrl !== details.url ) {
						objResolved["redirectUrl"] = redirectUrl;
					}
				}
			}
			resolve(objResolved);
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onTabsUpdated(tabId, changeInfo, tab) {
		if (changeInfo.status === "loading") {			// complete | loading
			handleTabChangedState(tabId);
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onTabsAttached(tabId) {
		browser.tabs.get(tabId).then((tab) => {
			if (tab.url.startsWith(URL_CDN_HRTZ) || tab.url.startsWith(URL_CDN_MRKR) ) {
				handleTabChangedState(tabId);
			}
		});
	}


	////////////////////////////////////////////////////////////////////////////////////
	//////////  H  A  N  D  L  E  S  ///////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////

	////////////////////////////////////////////////////////////////////////////////////
	function createMenus() {

		browser.menus.create({
			id: "mnu-revert-tab",
			title: "Revert Tab",
			contexts: ["tab", "all"],
			icons: { "16": "/icons/outwit-revert-next.svg" },
		});

		browser.menus.create({
			id: "mnu-disable-for-this-tab",
			title: "Disable OHP For This Tab",
			contexts: ["tab", "all"],
			icons: { "16": "/icons/outwit-disabled.svg" },
			type: "checkbox",
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function setOHPState(stateId = OHP_STATE.enabled.id) {

		let oldId = m_ohpStateId;

		m_ohpStateId = stateId;
		handleOHPListeners([ OHP_STATE.enabled.id, OHP_STATE.ignoreNextRequest.id, OHP_STATE.revertNextRequest.id ].includes(m_ohpStateId));
		handleBrowserButtonStateUI();

		console.log("[Outwit-Haaretz-Paywall]", "state change:", oldId, "➜", m_ohpStateId);
	}

	////////////////////////////////////////////////////////////////////////////////////
	function handleOHPListeners(addListeners = true) {

		if(addListeners && !browser.webRequest.onHeadersReceived.hasListener(onWebRequestHeadersReceived)) {

			// redirect some URLs to cdn.ampproject.org
			browser.webRequest.onHeadersReceived.addListener(onWebRequestHeadersReceived, WEB_REQUEST_FILTER, [ "blocking" ]);
			browser.tabs.onUpdated.addListener(onTabsUpdated, TABS_ON_UPDATED_FILTER);
			browser.tabs.onAttached.addListener(onTabsAttached);

		} else if(!addListeners && browser.webRequest.onHeadersReceived.hasListener(onWebRequestHeadersReceived)) {

			browser.webRequest.onHeadersReceived.removeListener(onWebRequestHeadersReceived);
			browser.tabs.onUpdated.removeListener(onTabsUpdated);
			browser.tabs.onAttached.removeListener(onTabsAttached);
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function handleBrowserButtonStateUI() {

		let state;

		if(m_ohpStateId === OHP_STATE.enabled.id) {
			state = OHP_STATE.enabled;
		} else if(m_ohpStateId === OHP_STATE.ignoreNextRequest.id) {
			state = OHP_STATE.ignoreNextRequest;
		} else if(m_ohpStateId === OHP_STATE.revertNextRequest.id) {
			state = OHP_STATE.revertNextRequest;
		} else if(m_ohpStateId === OHP_STATE.disabled.id) {
			state = OHP_STATE.disabled;
		}

		browser.browserAction.setTitle({ title: state.title });
		try {
			// Ignore if not supported
			// browserAction.setIcon not supported in Firefox for Android v68.0. Support starts from v79.0
			browser.browserAction.setIcon({ path: state.icon });
		} catch {}

		setPreferenceValue("pref_stateId", m_ohpStateId);
	}

	////////////////////////////////////////////////////////////////////////////////////
	async function handleBrowserButtonPopup() {

		let mobileBrowser = /\bMobile\b/i.test(navigator.userAgent);
		let prefWithPopup = await getPreferenceValue("pref_withPopup", mobileBrowser);

		/*	popup value:
			+ Null. Reverts to default value specified in 'default_popup' in the manifest.
			+ Empty string. Popup is disabled and extension will receive browserAction.onClicked events.
		*/
		browser.browserAction.setPopup({ popup: ( (mobileBrowser || prefWithPopup) ? null : "" ) });
	}

	////////////////////////////////////////////////////////////////////////////////////
	function handleTabChangedState(tabId) {

		browser.tabs.executeScript(tabId, { runAt: "document_idle", code: "let g_injectSourceCodeRedeclarationFlag = true;" }).then(() => {

			browser.tabs.insertCSS(tabId, { runAt: "document_start", code: CSS_RULES_PRETTY_PAGE }).catch((error) => {
				console.log("[Outwit-Haaretz-Paywall]", "inject CSS error:", error);
			});
			browser.tabs.executeScript(tabId, { runAt: "document_idle", code: JS_SEND_MSG_REVERT_TAB.replace("$1", tabId) }).catch((error) => {
				console.log("[Outwit-Haaretz-Paywall]", "inject JS error:", error);
			});

		}).catch((error) => {
			if( !error.message.startsWith("redeclaration") ) {
				console.log("[Outwit-Haaretz-Paywall]", "inject redeclaration flag error:", error);
			}
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function getRedirectUrlToCDN(url) {

		purgeMapRedirectedUrls(MAX_MAP_REDIRECTED_URLS_ENTRIES);

		let redirectUrl;

		if(url.startsWith(HOST_HAARETZ)) {
			redirectUrl = url.replace(RX_HAARETZ, HRTZ_REPLACEMENT);
			m_mapRedirectedUrls.set(redirectUrl, url);
		} else if(url.startsWith(HOST_THEMARKER)) {
			redirectUrl = url.replace(RX_THEMARKER, MRKR_REPLACEMENT);
			m_mapRedirectedUrls.set(redirectUrl, url);
		}
		return redirectUrl;
	}

	////////////////////////////////////////////////////////////////////////////////////
	function getRedirectUrlToHost(url) {

		let redirectUrl = m_mapRedirectedUrls.get(url);

		// fallback
		if(!!!redirectUrl) {
			if(url.startsWith(URL_CDN_HRTZ)) {
				return url.replace(URL_CDN_HRTZ, HRTZ_REVERT_REPLACEMENT).replace(QUERY_STRING_CDN, "");
			} else if(url.startsWith(URL_CDN_MRKR)) {
				return url.replace(URL_CDN_MRKR, MRKR_REVERT_REPLACEMENT).replace(QUERY_STRING_CDN, "");;
			}
		}
		return redirectUrl;
	}

	////////////////////////////////////////////////////////////////////////////////////
	function purgeMapRedirectedUrls(maxSize) {

		let count = m_mapRedirectedUrls.size - maxSize;

		let asyncPurge = () => {
			let keys = Array.from(m_mapRedirectedUrls.keys()).slice(0, count);
			for(let i=0, len=keys.length; i<len; i++) {
				m_mapRedirectedUrls.delete(keys[i]);
			}
		};

		if(count > 0) {
			setTimeout(asyncPurge, 1);
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function printLogHelp() {

		let cssLineStyle = "white-space:nowrap;border-top:15px solid #232327;border-bottom:15px solid #232327;background-color:#232327;";
		let cssHeaderStyle1 = cssLineStyle + "color:#ffff00;font-size:200%;font-weight:bold;";
		let cssHeaderStyle2 = cssLineStyle + "color:#ff00ff;font-size:175%;";
		let cssTextStyle1 = cssLineStyle + "color:#ff00ff;font-size:125%;font-weight:bold;";
		let cssTextStyle2 = cssLineStyle + "color:#e9e9e9;font-size:125%;";
		let cssCodeStyle = cssLineStyle + "color:#45a1ff;font-size:125%;font-family:monospace; ";

		console.group("%c Extension: Outwit Haaretz Paywall\t\t", cssHeaderStyle1);
		console.log("%c Changing Hidden Preferences:\t\t", cssHeaderStyle2);
		console.log("%c   1. %cOpen web extension console (about:debugging ➜ Extensions ➜ Outwit Haaretz Paywall ➜ Inspect).\t\t", cssTextStyle1, cssTextStyle2);
		console.log("%c   2. %cIn the newly opened Inspect page go to the 'Console' tab.\t\t", cssTextStyle1, cssTextStyle2);
		console.log("%c   3. %cTo enable the toolbar button popup: Type %cOHP.withPopup()%c in the console and press enter.\t\t", cssTextStyle1, cssTextStyle2, cssCodeStyle, cssTextStyle2);
		console.log("%c   4. %cTo disable the toolbar button popup: Type %cOHP.withoutPopup()%c in the console and press enter.\t\t", cssTextStyle1, cssTextStyle2, cssCodeStyle, cssTextStyle2);
		console.log("%c\u200B", cssTextStyle1);		// zero width space
		console.groupEnd();
	}

	////////////////////////////////////////////////////////////////////////////////////
	//////////  P  R  E  F  E  R  E  N  C  E  S  ///////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////

	////////////////////////////////////////////////////////////////////////////////////
	function getPreferenceValue(pref, defValue) {
		return new Promise((resolve) => {
			browser.storage.local.get(pref).then((result) => {
				resolve(result[pref] === undefined ? defValue : result[pref]);
			});
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function setPreferenceValue(pref, value) {
		return browser.storage.local.set({ [pref]: value });
	}

	////////////////////////////////////////////////////////////////////////////////////
	function setPref_withPopup(value) {
		setPreferenceValue("pref_withPopup", value).then(() => handleBrowserButtonPopup());
	}

	////////////////////////////////////////////////////////////////////////////////////
	////////// P U B L I C /////////////////////////////////////////////////////////////
	return {
		withPopup: () => setPref_withPopup(true),
		withoutPopup: () => setPref_withPopup(false)
	}
})();
