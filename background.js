"use strict";

(function () {

	const HOST_HAARETZ = "https://www.haaretz.co.il";
	const HOST_THEMARKER = "https://www.themarker.com";

	const RX_HAARETZ = new RegExp("^(" + HOST_HAARETZ + "/)([^\\?]*)(\\?.*)?$", "i");
	const RX_THEMARKER = new RegExp("^(" + HOST_THEMARKER + "/)([^\\?]*)(\\?.*)?$", "i");

	const URL_CDN_HRTZ = "https://www-haaretz-co-il.cdn.ampproject.org/v/s/www.haaretz.co.il/amp/";
	const URL_CDN_MRKR = "https://www-themarker-com.cdn.ampproject.org/v/s/www.themarker.com/amp/";

	const QUERY_STRING_CDN = "?amp_js_v=0.1";
	// const QUERY_STRING_CDN_FULL = "?usqp=mq331AQFKAGwASA%3D&amp_js_v=0.1#aoh=15939449457246&referrer=https%3A%2F%2Fwww.google.com&amp_tf=From%20%251%24s&ampshare=https%3A%2F%2Fwww.haaretz.co.il";


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


	const BROWSER_ACTION_IMAGE_PATHS = {
		16: "/icons/outwit-16.png",
		32: "/icons/outwit-32.png",
		48: "/icons/outwit-48.png"
	};

	const BROWSER_ACTION_IGNORE_NEXT_IMAGE_PATHS = {
		16: "/icons/outwit-ignore-next-16.png",
		32: "/icons/outwit-ignore-next-32.png",
		48: "/icons/outwit-ignore-next-48.png"
	};

	const BROWSER_ACTION_DISABLE_IMAGE_PATHS = {
		16: "/icons/outwit-disabled-16.png",
		32: "/icons/outwit-disabled-32.png",
		48: "/icons/outwit-disabled-48.png"
	};

	const OHP_STATE = {
		enabled: 0,
		ignoreNextRequest: 1,
		disabled: 2
	};

	const CSS_RULE_BODY =	"html:not([amp4ads]) body {" +
								"margin-right: 15% !important;" +
								"margin-left: 40% !important;" +
								"font-size: 100% !important;" +
							"}";

	// const CSS_RULE_HIDE_STUFF =	".c-list-honda," +
	// 							".c-list-honda__items," +
	// 							".u-autospace--2," +
	// 							".u-type--epsilon," +
	// 							"amp-sticky-ad.i-amphtml-layout-nodisplay," +
	// 							"amp-embed[data-ampurl]," +
	// 							"amp-ad { " +
	// 								"display: none !important;" +
	// 							"}";

	const CSS_RULES_PRETTY_PAGE = CSS_RULE_BODY;	// CSS_RULE_HIDE_STUFF is removed by uBlock

	let m_ohpState;


	initialization();

	////////////////////////////////////////////////////////////////////////////////////
	function initialization() {

		m_ohpState = OHP_STATE.enabled;
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

		if(m_ohpState === OHP_STATE.enabled) {
			m_ohpState = OHP_STATE.ignoreNextRequest;
		} else if(m_ohpState === OHP_STATE.ignoreNextRequest) {
			m_ohpState = OHP_STATE.disabled;
		} else if(m_ohpState === OHP_STATE.disabled) {
			m_ohpState = OHP_STATE.enabled;
		}

		handleOHPListeners([ OHP_STATE.enabled, OHP_STATE.ignoreNextRequest ].includes(m_ohpState));
		handleBrowserButtonUI();
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onCommands(command) {
		switch (command) {

			case "kb-ignore-next-request":
				m_ohpState = OHP_STATE.ignoreNextRequest;
				handleOHPListeners();
				handleBrowserButtonUI();
				break;
				//////////////////////////////////////////////////////////////
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onWebRequestHeadersReceived(details) {

		return new Promise((resolve) => {

			let objResolved = {};

			if(details.statusCode === 200) {

				if(m_ohpState === OHP_STATE.ignoreNextRequest) {
					m_ohpState = OHP_STATE.enabled;
					handleBrowserButtonUI();
				} else if(m_ohpState === OHP_STATE.enabled) {
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

		let title, images;

		if(m_ohpState === OHP_STATE.enabled) {
			title = "OHP - Enabled";
			images = BROWSER_ACTION_IMAGE_PATHS;
		} else if(m_ohpState === OHP_STATE.ignoreNextRequest) {
			title = "OHP - Ignore Next";
			images = BROWSER_ACTION_IGNORE_NEXT_IMAGE_PATHS
		} else if(m_ohpState === OHP_STATE.disabled) {
			title = "OHP - Disabled";
			images = BROWSER_ACTION_DISABLE_IMAGE_PATHS;
		}

		browser.browserAction.setTitle({ title: title });
		browser.browserAction.setIcon({ path: images });
	}

	////////////////////////////////////////////////////////////////////////////////////
	function handleTabChangedState(tabId) {
		browser.tabs.insertCSS(tabId, { runAt: "document_start", code: CSS_RULES_PRETTY_PAGE }).catch((error) => {
			console.log("[Outwit-Haaretz-Paywall]", "inject CSS error:", error);
		});
	}
})();
