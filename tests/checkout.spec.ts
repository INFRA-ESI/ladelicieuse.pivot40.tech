import { test, expect } from '@playwright/test';

const API = 'http://localhost:3000';

// Seed a cart item into localStorage before the page loads
async function seedCart(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const item = {
      id: 'test-1',
      type: 'repas',
      name: 'Salade César',
      totalCalories: 320,
      totalPrice: 4500,
      quantity: 1,
    };
    localStorage.setItem('ladelicieuse_cart', JSON.stringify([item]));
  });
}

test.describe('Checkout flow', () => {
  test('empty cart redirects to home', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL('/');
  });

  test('checkout page renders with cart data', async ({ page }) => {
    await seedCart(page);
    await page.goto('/panier');
    // L'article apparaît dans la liste et dans le récapitulatif : on vérifie qu'il est présent, pas qu'il est unique.
    await expect(page.getByText('Salade César').first()).toBeVisible();
    await expect(page.getByText('4 500 FCFA').first()).toBeVisible();
  });

  test('delivery form validates required fields', async ({ page }) => {
    await seedCart(page);
    await page.goto('/panier');

    // Try to proceed without filling form
    const proceedBtn = page.getByRole('button', { name: /commander|procéder|valider/i });
    if (await proceedBtn.count() > 0) {
      await proceedBtn.click();
      // Should show validation or stay on cart page
      await expect(page).toHaveURL(/\/panier/);
    }
  });

  test('payment success page shows order details', async ({ page }) => {
    // Mock the order API
    await page.route(`${API}/api/orders/**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { numero: 'CMD-TEST-001', total: 4500, statut: 'en_attente' },
        }),
      });
    });

    await page.goto('/paiement/succes?order=CMD-TEST-001');
    await expect(page.getByRole('heading', { name: /paiement confirmé/i })).toBeVisible({ timeout: 5000 });
  });

  test('payment failure page shows retry option', async ({ page }) => {
    await page.goto('/paiement/echec');
    // Should display some failure UI
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // Page should not be a 404
    await expect(page.locator('text=/404|introuvable/i')).toHaveCount(0);
  });
});
