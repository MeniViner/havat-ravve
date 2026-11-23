import XCTest

final class MobileSmokeTests: XCTestCase {
    func testGuestSignInOptionsAndTeamDemo() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        let exitDemo = app.buttons["יציאה"]
        let account = app.buttons["החשבון שלי"]
        let enterDemo = app.buttons["כניסה להדגמה"]
        if exitDemo.waitForExistence(timeout: 2) {
            exitDemo.tap()
            if enterDemo.waitForExistence(timeout: 5) { app.buttons["חזרה"].tap() }
        }
        addTeardownBlock {
            if exitDemo.exists { exitDemo.tap() }
        }
        XCTAssertTrue(account.waitForExistence(timeout: 15))
        account.tap()
        XCTAssertTrue(app.buttons["המשך עם Google"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["המשך עם Apple"].exists)
        let signInScreenshot = XCTAttachment(screenshot: app.screenshot())
        signInScreenshot.name = "iPhone sign-in options"
        signInScreenshot.lifetime = .keepAlways
        add(signInScreenshot)

        app.buttons["לראות איך האפליקציה עובדת, בנתוני הדגמה"].tap()
        XCTAssertTrue(enterDemo.waitForExistence(timeout: 5))
        enterDemo.tap()

        let tasks = app.buttons["משימות"]
        XCTAssertTrue(tasks.waitForExistence(timeout: 5))
        tasks.tap()
        XCTAssertTrue(app.staticTexts["לסדר את ארגז הכלים במכולה"].waitForExistence(timeout: 5))

        app.buttons["קניות"].tap()
        XCTAssertTrue(app.buttons["אני בסופר, מתחילים"].waitForExistence(timeout: 5))
        exitDemo.tap()
        XCTAssertTrue(enterDemo.waitForExistence(timeout: 5))
    }
}
