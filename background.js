"use strict";

(function () {

	const HOST_HAARETZ = "https://www.haaretz.co.il";
	const HOST_THEMARKER = "https://www.themarker.com";

	const RX_HAARETZ = new RegExp("^(" + HOST_HAARETZ + "/)([^\\?]*)(\\?.*)?$", "i");
	const RX_THEMARKER = new RegExp("^(" + HOST_THEMARKER + "/)([^\\?]*)(\\?.*)?$", "i");

	const URL_CDN_AMP_HRTZ = "https://www-haaretz-co-il.cdn.ampproject.org/v/s/www.haaretz.co.il/amp/";
	const URL_CDN_AMP_MRKR = "https://www-themarker-com.cdn.ampproject.org/v/s/www.themarker.com/amp/";

	const QUERY_STRING = "?amp_js_v=0.1";
	//const QUERY_STRING_FULL = "?usqp=mq331AQFKAGwASA%3D&amp_js_v=0.1#aoh=15939449457246&referrer=https%3A%2F%2Fwww.google.com&amp_tf=From%20%251%24s&ampshare=https%3A%2F%2Fwww.haaretz.co.il";

	const CSS_RULE_BODY =	"html:not([amp4ads]) body {" +
								"margin-right: 15% !important; " +
								"margin-left: 40% !important; " +
								"font-size: 99.8% !important; " +
							"} ";

	const CSS_RULE_HIDE_STUFF =	".c-list-honda, " +
								".c-list-honda__items, " +
								".u-autospace--2, " +
								".u-type--epsilon, " +
								"amp-sticky-ad.i-amphtml-layout-nodisplay, " +
								"amp-embed[data-ampurl], " +
								"amp-ad { " +
									"display: none !important;" +
								"} ";

	const CSS_RULES_PRETTY_PAGE = CSS_RULE_BODY;	// CSS_RULE_HIDE_STUFF is removed by uBlock


	initialization();

	////////////////////////////////////////////////////////////////////////////////////
	function initialization() {

		const WEB_REQUEST_FILTER = {
			urls: [
				HOST_HAARETZ + "/*.premium*",
				HOST_THEMARKER + "/*.premium*"
			],
			types: [ "main_frame" ]
		};

		const TABS_ON_UPDATED_FILTER = {
			urls: [
				URL_CDN_AMP_HRTZ + "*",
				URL_CDN_AMP_MRKR + "*"
			],
			properties: [ "status" ]
		};


		// redirect some URL to cdn.ampproject.org
		browser.webRequest.onHeadersReceived.addListener(onWebRequestHeadersReceived, WEB_REQUEST_FILTER, [ "blocking" ]);
		browser.tabs.onUpdated.addListener(onTabsUpdated, TABS_ON_UPDATED_FILTER);
		browser.tabs.onAttached.addListener(onTabsAttached);
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onWebRequestHeadersReceived(details) {

		return new Promise((resolve) => {

			let objResolved = {};
			if(details.statusCode === 200) {

				if(details.url.startsWith(HOST_HAARETZ)) {
					objResolved = { redirectUrl: details.url.replace(RX_HAARETZ, URL_CDN_AMP_HRTZ + "$2" + QUERY_STRING) };
				} else if(details.url.startsWith(HOST_THEMARKER)) {
					objResolved = { redirectUrl: details.url.replace(RX_THEMARKER, URL_CDN_AMP_MRKR + "$2" + QUERY_STRING) };
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
			if (tab.url.startsWith(URL_CDN_AMP_HRTZ) || tab.url.startsWith(URL_CDN_AMP_MRKR) ) {
				handleTabChangedState(tabId);
			}
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function handleTabChangedState(tabId) {
		browser.tabs.insertCSS(tabId, { runAt: "document_start", code: CSS_RULES_PRETTY_PAGE }).catch((error) => {
			console.log("[Outwit-Haaretz-Paywall]", "inject CSS error:", error);
		});
	}
})();
