"use strict";

(function () {

	let m_elmStateEnable;
	let m_elmStateIgnoreNext;
	let m_elmStateRevertNext;
	let m_elmStateDisable;

	initialization();

	////////////////////////////////////////////////////////////////////////////////////
	function initialization() {
		document.addEventListener("DOMContentLoaded", onDOMContentLoaded);
		window.addEventListener("unload", onUnload);
		browser.runtime.onMessage.addListener(onRuntimeMessage);
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onRuntimeMessage(message) {
		if(message.id === "msg_closePopupIfOpen") {
			window.close();
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onDOMContentLoaded() {

		document.getElementById("version").textContent = "v" + browser.runtime.getManifest().version;

		m_elmStateEnable = document.getElementById("stateEnable");
		m_elmStateIgnoreNext = document.getElementById("stateIgnoreNext");
		m_elmStateRevertNext = document.getElementById("stateRevertNext");
		m_elmStateDisable = document.getElementById("stateDisable");

		m_elmStateEnable.addEventListener("change", onChangeOHPState);
		m_elmStateIgnoreNext.addEventListener("change", onChangeOHPState);
		m_elmStateRevertNext.addEventListener("change", onChangeOHPState);
		m_elmStateDisable.addEventListener("change", onChangeOHPState);

		setOHPStateId();
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onUnload(event) {
		document.removeEventListener("DOMContentLoaded", onDOMContentLoaded);
		window.removeEventListener("unload", onUnload);

		m_elmStateEnable.removeEventListener("change", onChangeOHPState);
		m_elmStateIgnoreNext.removeEventListener("change", onChangeOHPState);
		m_elmStateRevertNext.removeEventListener("change", onChangeOHPState);
		m_elmStateDisable.removeEventListener("change", onChangeOHPState);
	}

	////////////////////////////////////////////////////////////////////////////////////
	function setOHPStateId() {

		browser.runtime.sendMessage({ id: "msg_getOHPStateId" }).then((response) => {

			let ohpStateId = !!response ? response.ohpStateId : undefined;

			// state ID values
			if([0, 1, 2, 3].includes(ohpStateId)) {
				document.querySelector(".ohpStateId[value=\"" + ohpStateId + "\"]").checked = true;
			} else {
				window.close();
			}
		});
	}

	////////////////////////////////////////////////////////////////////////////////////
	function onChangeOHPState(event) {
		browser.runtime.sendMessage({ id: "msg_setOHPStateId", ohpStateId: parseInt(event.target.value) });
		setTimeout(() => window.close(), 250);
	}
})();
