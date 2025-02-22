/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function waitForLoginCountToReach(browser, loginCount) {
  return SpecialPowers.spawn(
    browser,
    [loginCount],
    async expectedLoginCount => {
      let loginList = Cu.waiveXrays(
        content.document.querySelector("login-list")
      );
      await ContentTaskUtils.waitForCondition(() => {
        return loginList._loginGuidsSortedOrder.length == expectedLoginCount;
      });
      return loginList._loginGuidsSortedOrder.length;
    }
  );
}

add_setup(async function () {
  await addLogin(TEST_LOGIN1);
  registerCleanupFunction(() => {
    Services.logins.removeAllUserFacingLogins();
    LoginTestUtils.primaryPassword.disable();
  });
});

add_task(async function test() {
  // Confirm that the mocking of the OS auth dialog isn't enabled so the
  // test will timeout if a real OS auth dialog is shown. We don't show
  // the OS auth dialog when Primary Password is enabled.
  Assert.equal(
    Services.prefs.getStringPref(
      "toolkit.osKeyStore.unofficialBuildOnlyLogin",
      ""
    ),
    "",
    "Pref should be set to default value of empty string to start the test"
  );
  LoginTestUtils.primaryPassword.enable();

  let mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("cancel");
  await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  await mpDialogShown;

  let browser = gBrowser.selectedBrowser;
  let logins = await waitForLoginCountToReach(browser, 0);
  Assert.equal(
    logins,
    0,
    "No logins should be displayed when MP is set and unauthenticated"
  );

  let notification;
  await TestUtils.waitForCondition(
    () =>
      (notification = gBrowser
        .getNotificationBox()
        .getNotificationWithValue("primary-password-login-required")),
    "waiting for primary-password-login-required notification"
  );

  Assert.ok(
    notification,
    "primary-password-login-required notification should be visible"
  );

  let buttons = notification.buttonContainer.querySelectorAll(
    ".notification-button"
  );
  Assert.equal(buttons.length, 1, "Should have one button.");

  let refreshPromise = BrowserTestUtils.browserLoaded(browser);
  // Sign in with the Primary Password this time the dialog is shown
  mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("authenticate");
  // Click the button to reload the page.
  buttons[0].click();
  await refreshPromise;
  info("Page reloaded");

  await mpDialogShown;
  info("Primary Password dialog shown and authenticated");

  logins = await waitForLoginCountToReach(browser, 1);
  Assert.equal(
    logins,
    1,
    "Logins should be displayed when MP is set and authenticated"
  );

  // Show MP dialog when Copy Password button clicked
  mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("cancel");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let copyButton = loginItem.shadowRoot
      .querySelector(".copy-password-button")
      .shadowRoot.querySelector("button");
    copyButton.click();
  });
  await mpDialogShown;
  info("Primary Password dialog shown and canceled");
  mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("authenticate");
  info("Clicking copy password button again");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let copyButton = loginItem.shadowRoot
      .querySelector(".copy-password-button")
      .shadowRoot.querySelector("button");
    copyButton.click();
  });
  await mpDialogShown;
  info("Primary Password dialog shown and authenticated");
  await SpecialPowers.spawn(browser, [], async function () {
    info("Password was copied to clipboard");
  });

  // Show MP dialog when Reveal Password checkbox is checked if not on a new login
  mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("cancel");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let revealCheckbox = loginItem.shadowRoot.querySelector(
      ".reveal-password-checkbox"
    );
    revealCheckbox.click();
  });
  await mpDialogShown;
  info("Primary Password dialog shown and canceled");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let revealCheckbox = loginItem.shadowRoot.querySelector(
      ".reveal-password-checkbox"
    );
    Assert.ok(
      !revealCheckbox.checked,
      "reveal checkbox should be unchecked if MP dialog canceled"
    );
  });
  mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("authenticate");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let revealCheckbox = loginItem.shadowRoot.querySelector(
      ".reveal-password-checkbox"
    );
    revealCheckbox.click();
  });
  await mpDialogShown;
  info("Primary Password dialog shown and authenticated");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let revealCheckbox = loginItem.shadowRoot.querySelector(
      ".reveal-password-checkbox"
    );
    Assert.ok(
      revealCheckbox.checked,
      "reveal checkbox should be checked if MP dialog authenticated"
    );
  });

  info("Test toggling the password visibility on a new login");
  await SpecialPowers.spawn(browser, [], async function createNewToggle() {
    let createButton = content.document
      .querySelector("login-list")
      .shadowRoot.querySelector(".create-login-button")
      .shadowRoot.querySelector("button");
    createButton.click();

    let loginItem = Cu.waiveXrays(content.document.querySelector("login-item"));
    let passwordField = loginItem.shadowRoot.querySelector(
      "input[name='password']"
    );
    let revealCheckbox = loginItem.shadowRoot.querySelector(
      ".reveal-password-checkbox"
    );
    Assert.ok(ContentTaskUtils.is_visible(revealCheckbox), "Toggle visible");
    Assert.ok(!revealCheckbox.checked, "Not revealed initially");
    Assert.equal(passwordField.type, "password", "type is password");
    revealCheckbox.click();

    await ContentTaskUtils.waitForCondition(() => {
      return passwordField.type == "text";
    }, "Waiting for type='text'");
    Assert.ok(revealCheckbox.checked, "Not revealed after click");

    let cancelButton = loginItem.shadowRoot.querySelector(".cancel-button");
    cancelButton.click();
  });

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    const loginList = Cu.waiveXrays(
      content.document.querySelector("login-list")
    );

    const loginFilter = Cu.waiveXrays(
      loginList.shadowRoot.querySelector("login-filter")
    );
    loginFilter.value = "pass1";
    Assert.equal(
      loginList._list.querySelectorAll(
        "login-list-item[data-guid]:not([hidden])"
      ).length,
      1,
      "login-list should show corresponding result when primary password is enabled"
    );
    loginFilter.value = "";
    Assert.equal(
      loginList._list.querySelectorAll(
        "login-list-item[data-guid]:not([hidden])"
      ).length,
      1,
      "login-list should show all results since the filter is empty"
    );
  });
  LoginTestUtils.primaryPassword.disable();
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    Cu.waiveXrays(content).AboutLoginsUtils.primaryPasswordEnabled = false;
    const loginList = Cu.waiveXrays(
      content.document.querySelector("login-list")
    );
    const loginFilter = Cu.waiveXrays(
      loginList.shadowRoot.querySelector("login-filter")
    );
    loginFilter.value = "pass1";
    Assert.equal(
      loginList._list.querySelectorAll(
        "login-list-item[data-guid]:not([hidden])"
      ).length,
      1,
      "login-list should show login with matching password since MP is disabled"
    );
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function test_login_item_after_successful_auth() {
  // Confirm that the mocking of the OS auth dialog isn't enabled so the
  // test will timeout if a real OS auth dialog is shown. We don't show
  // the OS auth dialog when Primary Password is enabled.
  Assert.equal(
    Services.prefs.getStringPref(
      "toolkit.osKeyStore.unofficialBuildOnlyLogin",
      ""
    ),
    "",
    "Pref should be set to default value of empty string to start the test"
  );
  LoginTestUtils.primaryPassword.enable();

  let mpDialogShown = forceAuthTimeoutAndWaitForMPDialog("authenticate");
  await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  await mpDialogShown;

  let browser = gBrowser.selectedBrowser;
  let logins = await waitForLoginCountToReach(browser, 1);
  Assert.equal(
    logins,
    1,
    "Logins should be displayed when MP is set and authenticated"
  );
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    Assert.ok(
      !loginItem.classList.contains("no-logins"),
      "Login item should have content after MP is authenticated"
    );
  });

  LoginTestUtils.primaryPassword.disable();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
