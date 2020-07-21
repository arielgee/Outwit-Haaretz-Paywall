"use strict";

(function () {

	const HOST_HAARETZ = "https://www.haaretz.co.il";
	const HOST_THEMARKER = "https://www.themarker.com";

	const RX_HAARETZ = new RegExp("^(" + HOST_HAARETZ + "/)([^\\?]*)(\\?.*)?$", "i");
	const RX_THEMARKER = new RegExp("^(" + HOST_THEMARKER + "/)([^\\?]*)(\\?.*)?$", "i");

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

	let m_ohpStateId;


	initialization();

	////////////////////////////////////////////////////////////////////////////////////
	function initialization() {

		m_ohpStateId = OHP_STATE.enabled.id;
		handleOHPListeners();
		handleBrowserButtonUI();
		browser.browserAction.onClicked.addListener(onBrowserActionClicked);
		browser.commands.onCommand.addListener(onCommands);
	}


	////////////////////////////////////////////////////////////////////////////////////
	//////////  E  V  E  N  T     L  I  S  T  E  N  E  R  S  ///////////////////////////
	////////////////////////////////////////////////////////////////////////////////////

	////////////////////////////////////////////////////////////////////////////////////
	function onBrowserActionClicked(tab) {

		let oldId = m_ohpStateId;

		if(m_ohpStateId === OHP_STATE.enabled.id) {
			m_ohpStateId = OHP_STATE.ignoreNextRequest.id;
		} else if(m_ohpStateId === OHP_STATE.ignoreNextRequest.id) {
			m_ohpStateId = OHP_STATE.disabled.id;
		} else /*if(m_ohpStateId === OHP_STATE.disabled.id)*/ {
			m_ohpStateId = OHP_STATE.enabled.id;
		}

		console.log("[Outwit-Haaretz-Paywall]", "state ID:", oldId, "➜", m_ohpStateId);

		handleOHPListeners([ OHP_STATE.enabled.id, OHP_STATE.ignoreNextRequest.id ].includes(m_ohpStateId));
		handleBrowserButtonUI();
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onCommands(command) {
		switch (command) {
			case "state-enable":			m_ohpStateId = OHP_STATE.enabled.id;			break;
			case "state-ignore-next-req":	m_ohpStateId = OHP_STATE.ignoreNextRequest.id;	break;
			case "state-disable":			m_ohpStateId = OHP_STATE.disabled.id;			break;
		}
		handleOHPListeners();
		handleBrowserButtonUI();
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onWebRequestHeadersReceived(details) {

		return new Promise((resolve) => {

			let objResolved = {};

			if(details.statusCode === 200) {

				if(m_ohpStateId === OHP_STATE.ignoreNextRequest.id) {
					m_ohpStateId = OHP_STATE.enabled.id;
					handleBrowserButtonUI();
				} else if(m_ohpStateId === OHP_STATE.enabled.id) {
					if(details.url.startsWith(HOST_HAARETZ)) {
						objResolved = { redirectUrl: details.url.replace(RX_HAARETZ, URL_CDN_HRTZ + "$2" + QUERY_STRING_CDN) };
					} else if(details.url.startsWith(HOST_THEMARKER)) {
						objResolved = { redirectUrl: details.url.replace(RX_THEMARKER, URL_CDN_MRKR + "$2" + QUERY_STRING_CDN) };
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
	function handleBrowserButtonUI() {

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
	function handleTabChangedState(tabId) {
		browser.tabs.insertCSS(tabId, { runAt: "document_start", code: CSS_RULES_PRETTY_PAGE }).catch((error) => {
			console.log("[Outwit-Haaretz-Paywall]", "inject CSS error:", error);
		});
	}
})();
