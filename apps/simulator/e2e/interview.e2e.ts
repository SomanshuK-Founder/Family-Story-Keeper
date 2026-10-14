import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 820, height: 900 } });

test('Rosa completes a real MCP interview turn and resumes it after reload', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Connect' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('15 tools verified')).toBeVisible();
  await page.getByRole('button', { name: 'Start / Resume interview' }).focus();
  await page.keyboard.press('Enter');
  const firstQuestion = await page.locator('.current-question').textContent();
  expect(firstQuestion).toBeTruthy();

  const rawAnswer = 'The garden gate squeaked whenever the evening breeze came through.';
  await page.getByLabel('Rosa’s answer').focus();
  await page.keyboard.type(rawAnswer);
  await page.getByRole('button', { name: 'Submit answer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Answer saved. Your memory is safely stored.')).toBeVisible();
  await expect(page.getByLabel('Rosa’s answer')).toHaveValue('');
  const nextQuestion = await page.locator('.current-question').textContent();
  expect(nextQuestion).toBeTruthy();
  expect(nextQuestion).not.toBe(firstQuestion);

  const browserPersistence = await page.evaluate(
    (privateAnswer) => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      url: window.location.href,
      privateAnswer,
    }),
    rawAnswer,
  );
  expect(browserPersistence.local).not.toContain(rawAnswer);
  expect(browserPersistence.session).not.toContain(rawAnswer);
  expect(browserPersistence.url).not.toContain(encodeURIComponent(rawAnswer));

  await page.reload();
  await page.getByRole('button', { name: 'Connect' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('15 tools verified')).toBeVisible();
  await page.getByRole('button', { name: 'Start / Resume interview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.current-question')).toHaveText(nextQuestion ?? '');
  expect(consoleErrors).toEqual([]);
});
