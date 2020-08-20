"use strict";

let OHP = (function () {

	const HOST_HAARETZ = "https://www.haaretz.co.il";
	const HOST_THEMARKER = "https://www.themarker.com";

	const COMMON_RX_PART = "(.*\\.premium)(\\.highlight)?([^\\?]*)(\\?.*)?$";

	const RX_HAARETZ = new RegExp("^(" + HOST_HAARETZ + "/)" + COMMON_RX_PART, "i");
	const RX_THEMARKER = new RegExp("^(" + HOST_THEMARKER + "/)" + COMMON_RX_PART, "i");

	// const RX_COMMON_PATTERN = "^({$$}/)(.*\\.premium)(\\.highlight)?([^\\?]*)(\\?.*)?$";

	// const RX_HAARETZ = new RegExp(RX_COMMON_PATTERN.replace("{$$}", HOST_HAARETZ), "i");
	// const RX_THEMARKER = new RegExp(RX_COMMON_PATTERN.replace("{$$}", HOST_THEMARKER), "i");

	const URL_CDN_HRTZ = "https://www-haaretz-co-il.cdn.ampproject.org/v/s/www.haaretz.co.il/amp/";
	const URL_CDN_MRKR = "https://www-themarker-com.cdn.ampproject.org/v/s/www.themarker.com/amp/";

	const QUERY_STRING_CDN = "?amp_js_v=0.1";


	const WEB_REQUEST_FILTER = {
		urls: [
			HOST_HAARETZ + "/*.premium*",
			HOST_THEMARKER + "/*.premium*"
		],
		types: [ "main_frame" ]
	};

	const TABS_ON_UPDATED_FILTER = {
		urls: [
			URL_CDN_HRTZ + "*",
			URL_CDN_MRKR + "*"
		],
		properties: [ "status" ]
	};


	const BROWSER_ACTION_TITLE = browser.runtime.getManifest().browser_action.default_title;
	const OHP_STATE = {
		enabled: {
			id: 0,
			title: BROWSER_ACTION_TITLE + " - Enabled",
			icon: "/icons/outwit.svg"
		},
		ignoreNextRequest: {
			id: 1,
			title: BROWSER_ACTION_TITLE + " - Ignore Next",
			icon: "/icons/outwit-ignore-next.svg"
		},
		disabled: {
			id: 2,
			title: BROWSER_ACTION_TITLE + " - Disabled",
			icon: "/icons/outwit-disabled.svg"
		}
	}


	const CSS_RULES_PRETTY_PAGE =	"html:not([amp4ads]) body {" +
										"margin-right: 15% !important;" +
										"margin-left: 40% !important;" +
										"font-size: 100% !important;" +
									"}";

	let m_ohpStateId = -1;


	initialization();

	////////////////////////////////////////////////////////////////////////////////////
	async function initialization() {

		printLogHelp();

		handleBrowserButtonPopup();
		setOHPState(await getPreferenceValue("pref_stateId", OHP_STATE.enabled.id));
		browser.runtime.onMessage.addListener(onRuntimeMessage);
		browser.browserAction.onClicked.addListener(onBrowserActionClicked);
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
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onBrowserActionClicked(tab) {
		if(m_ohpStateId === OHP_STATE.enabled.id) {
			setOHPState(OHP_STATE.ignoreNextRequest.id);
		} else if(m_ohpStateId === OHP_STATE.ignoreNextRequest.id) {
			setOHPState(OHP_STATE.disabled.id);
		} else /*if(m_ohpStateId === OHP_STATE.disabled.id)*/ {
			setOHPState(OHP_STATE.enabled.id);
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onCommands(command) {

		browser.runtime.sendMessage({ id: "msg_closePopupIfOpen" }).catch(() => {});

		switch (command) {
			case "state-enable":			setOHPState(OHP_STATE.enabled.id);				break;
			case "state-ignore-next-req":	setOHPState(OHP_STATE.ignoreNextRequest.id);	break;
			case "state-disable":			setOHPState(OHP_STATE.disabled.id);				break;
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onWebRequestHeadersReceived(details) {

		return new Promise((resolve) => {

			let objResolved = {};

			if(details.statusCode === 200) {

				if(m_ohpStateId === OHP_STATE.ignoreNextRequest.id) {
					m_ohpStateId = OHP_STATE.enabled.id;
					handleBrowserButtonStateUI();
				} else if(m_ohpStateId === OHP_STATE.enabled.id) {
					if(details.url.startsWith(HOST_HAARETZ)) {
						objResolved = { redirectUrl: details.url.replace(RX_HAARETZ, URL_CDN_HRTZ + "$2$4" + QUERY_STRING_CDN) };
					} else if(details.url.startsWith(HOST_THEMARKER)) {
						objResolved = { redirectUrl: details.url.replace(RX_THEMARKER, URL_CDN_MRKR + "$2$4" + QUERY_STRING_CDN) };
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
	function setOHPState(stateId = OHP_STATE.enabled.id) {

		let oldId = m_ohpStateId;

		m_ohpStateId = stateId;
		setPreferenceValue("pref_stateId", m_ohpStateId);
		handleOHPListeners([ OHP_STATE.enabled.id, OHP_STATE.ignoreNextRequest.id ].includes(m_ohpStateId));
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
		} else if(m_ohpStateId === OHP_STATE.disabled.id) {
			state = OHP_STATE.disabled;
		}

		browser.browserAction.setTitle({ title: state.title });
		browser.browserAction.setIcon({ path: state.icon });
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
		browser.tabs.insertCSS(tabId, { runAt: "document_start", code: CSS_RULES_PRETTY_PAGE }).catch((error) => {
			console.log("[Outwit-Haaretz-Paywall]", "inject CSS error:", error);
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function printLogHelp() {

		let cssLineStyle = "line-height:200%;border-top:15px solid #232327;border-bottom:15px solid #232327;background-color:#232327;";
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
