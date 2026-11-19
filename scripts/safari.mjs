import { Builder } from "selenium-webdriver";
import safari from "selenium-webdriver/safari.js";

export async function openSafari(width, height) {
  const service = new safari.ServiceBuilder("/usr/bin/safaridriver").build();
  let driver;
  async function close() {
    try { await driver?.quit(); } finally { await service.kill(); }
  }
  try {
    driver = await new Builder().disableEnvironmentOverrides().usingServer(await service.start()).forBrowser("safari").build();
    const [dx, dy] = await driver.executeScript("return [outerWidth - innerWidth, outerHeight - innerHeight]");
    await driver.manage().window().setRect({ x: 0, y: 0, width: width + dx, height: height + dy });
    return {
      goto: url => driver.get(url),
      evaluate: expression => driver.executeScript(`return (${expression});`),
      screenshot: () => driver.takeScreenshot(), close
    };
  } catch (error) { await close(); throw error; }
}
