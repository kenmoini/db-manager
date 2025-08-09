import { chromium, firefox } from 'playwright';

async function testBrowserLoading() {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  
  try {
    console.log('🚀 Loading http://localhost:5174/');
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
    
    // Check page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Wait for React app to render
    await page.waitForSelector('#root', { timeout: 10000 });
    console.log('✅ React root element found');
    
    // Check for PatternFly Card components
    const cardSelectors = [
      '.pf-v6-c-card',
      '.pf-v5-c-card', 
      '.pf-c-card',
      '[class*="pf-c-card"]',
      '[class*="pf-v5-c-card"]',
      '[class*="pf-v6-c-card"]'
    ];
    
    let cardsFound = 0;
    for (const selector of cardSelectors) {
      const cards = await page.locator(selector).count();
      if (cards > 0) {
        console.log(`🃏 Found ${cards} card elements with selector: ${selector}`);
        cardsFound += cards;
      }
    }
    
    if (cardsFound === 0) {
      console.log('⚠️  No PatternFly Card components found');
    }
    
    // Check for main PatternFly components
    const masthead = await page.locator('[class*="pf-c-masthead"], [class*="pf-v5-c-masthead"], [class*="pf-v6-c-masthead"]').count();
    const sidebar = await page.locator('[class*="pf-c-page__sidebar"], [class*="pf-v5-c-page__sidebar"], [class*="pf-v6-c-page__sidebar"]').count();
    const pageSection = await page.locator('[class*="pf-c-page__main-section"], [class*="pf-v5-c-page__main-section"], [class*="pf-v6-c-page__main-section"]').count();
    
    console.log(`🎯 PatternFly components found:`);
    console.log(`   Masthead: ${masthead > 0 ? '✅' : '❌'}`);
    console.log(`   Sidebar: ${sidebar > 0 ? '✅' : '❌'}`);
    console.log(`   Page Section: ${pageSection > 0 ? '✅' : '❌'}`);
    
    // Check for JavaScript errors
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Wait a bit for any async errors
    await page.waitForTimeout(2000);
    
    if (errors.length > 0) {
      console.log('❌ JavaScript errors found:');
      errors.forEach(error => console.log(`   ${error}`));
    } else {
      console.log('✅ No JavaScript errors detected');
    }
    
    // Take a screenshot
    await page.screenshot({ path: '/tmp/app_screenshot.png', fullPage: true });
    console.log('📸 Screenshot saved to /tmp/app_screenshot.png');
    
    // Check if the "Deploy Database" section is visible
    const deploySection = await page.locator('text=Deploy Database').count();
    console.log(`🚀 Deploy Database section: ${deploySection > 0 ? '✅ Found' : '❌ Not found'}`);
    
    // Check current page content structure
    const bodyHTML = await page.locator('body').innerHTML();
    
    // Look for database selector cards specifically
    const databaseCards = await page.locator('[class*="card"]:has-text("PostgreSQL"), [class*="card"]:has-text("MySQL"), [class*="card"]:has-text("MongoDB")').count();
    console.log(`🗄️  Database selector cards: ${databaseCards}`);
    
    // Check if any cards are in the DOM but potentially not styled correctly
    const allCards = await page.locator('*').evaluateAll(elements => 
      elements.filter(el => el.tagName && (
        el.className.includes('card') || 
        el.className.includes('Card') ||
        el.getAttribute('data-testid')?.includes('card')
      )).length
    );
    console.log(`🔍 Total elements with 'card' in className or testid: ${allCards}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testBrowserLoading().catch(console.error);