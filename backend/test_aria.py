import asyncio
from playwright.async_api import async_playwright

url = 'https://docs.google.com/forms/d/e/1FAIpQLSeojSdS8Y4AKVsfmBy06nXpOdQZBGUypKmzsz-sRokzadktoQ/viewform?usp=publish-editor'

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until='networkidle')
        
        container = page.locator('.Qr7Oae').filter(has_text='date').first
        inputs = await container.locator('input[type="text"]').all()
        for inp in inputs:
            print('Aria:', await inp.get_attribute('aria-label'))

        await browser.close()

asyncio.run(run())
