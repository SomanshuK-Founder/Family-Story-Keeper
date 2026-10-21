import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 820, height: 900 } });

test('Rosa and Maya use the real memory and family-question lifecycle safely', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    consoleMessages.push(message.text());
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Story Keeper Simulator');
  await expect(
    page.getByRole('heading', { name: 'Talk with Story Keeper', level: 1 }),
  ).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('15 tools verified')).toBeVisible();
  await expect(page.getByText('The private garden', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start / Resume interview' }).focus();
  await page.keyboard.press('Enter');
  const developerInspector = page.locator('.developer-inspector');
  await expect(
    developerInspector
      .locator('.context-sections li')
      .filter({ hasText: 'Favorite place: The private garden' }),
  ).toBeVisible();
  await expect(
    developerInspector
      .locator('.context-sections li')
      .filter({ hasText: 'Favorite place: The old market square' }),
  ).toBeVisible();
  const firstQuestion = await page.locator('.current-question').textContent();
  expect(firstQuestion).toBeTruthy();

  const rawAnswer = 'The garden gate squeaked whenever the evening breeze came through.';
  await page.getByLabel('Rosa’s answer').focus();
  await page.keyboard.type(rawAnswer);
  await page.getByRole('button', { name: 'Submit answer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your answer was saved.')).toBeVisible();
  await expect(
    page.getByText('Story Keeper is organizing the memory.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Rosa’s answer')).toHaveValue('');
  await expect(page.getByText(rawAnswer, { exact: true })).not.toBeVisible();
  await expect(page.getByText('New structured memory is ready.')).toBeVisible();
  const pendingMemory = page.getByRole('region', { name: 'Review story memories' });
  await expect(pendingMemory.getByText('The garden gate in the evening breeze')).toBeVisible();
  await expect(
    pendingMemory.getByRole('heading', { name: 'Possible child relationship' }),
  ).toBeVisible();
  await expect(
    pendingMemory.getByRole('heading', { name: 'Possible sibling relationship' }),
  ).toBeVisible();
  await expect(
    pendingMemory.getByRole('heading', { name: 'Evenings by the garden gate' }),
  ).toBeVisible();
  await expect(pendingMemory.getByText('Around 1974')).toBeVisible();
  const clarification = pendingMemory.getByRole('region', { name: 'Needs clarification' });
  const possibleMatchCard = clarification.getByRole('heading', { name: 'Raj' }).locator('..');
  await expect(possibleMatchCard.getByText('Possible person')).toBeVisible();
  await expect(
    possibleMatchCard.getByText(/has not linked this person automatically/),
  ).toBeVisible();
  await expect(possibleMatchCard.getByText(/remains unresolved/)).toBeVisible();
  const noSelectedMatchCard = clarification.getByRole('heading', { name: 'Devika' }).locator('..');
  await expect(noSelectedMatchCard.getByText('Person needs clarification')).toBeVisible();
  await expect(noSelectedMatchCard.getByText(/No confirmed match has been selected/)).toBeVisible();
  await expect(noSelectedMatchCard.getByText(/remains unresolved/)).toBeVisible();
  await expect(noSelectedMatchCard.getByText('Possible person')).toHaveCount(0);
  await expect(noSelectedMatchCard.getByText('Confirmed person')).toHaveCount(0);
  await expect(
    noSelectedMatchCard.getByRole('button', { name: /merge|select|confirm|resolve/i }),
  ).toHaveCount(0);
  await expect(pendingMemory.getByText(/person reference needs clarification/)).toBeVisible();
  await expect(pendingMemory.getByText(/Both people are confirmed references/)).toBeVisible();

  const conflictReview = page.getByRole('region', { name: 'Memories that need review' });
  await expect(conflictReview.getByRole('heading', { name: 'Possible conflict 1' })).toBeVisible();
  await expect(conflictReview.getByText('The private garden', { exact: true })).toBeVisible();
  await expect(conflictReview.getByText('The old market square', { exact: true })).toBeVisible();
  await expect(
    conflictReview.getByRole('button', { name: 'These were different events' }),
  ).toHaveCount(0);

  const factCard = pendingMemory.getByRole('heading', { name: 'Garden sound' }).locator('..');
  await factCard.getByText('Source details').focus();
  await page.keyboard.press('Enter');
  await expect(factCard.getByText('Supported by 1 interview source.')).toBeVisible();
  await expect(factCard.getByText('Story item: Fact')).toBeVisible();
  await expect(pendingMemory.getByText(/From Rosa’s interview/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('phase-6-820.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('phase-6-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 820, height: 900 });

  await conflictReview.getByRole('button', { name: 'Keep the first memory' }).focus();
  await page.keyboard.press('Enter');
  const confirmationHeading = conflictReview.getByRole('heading', {
    name: 'Keep the first memory?',
  });
  await expect(confirmationHeading).toBeVisible();
  await expect(
    conflictReview.getByText(/second pending memory will be marked rejected/i),
  ).toBeVisible();
  await expect(conflictReview.getByText(/does not approve either memory/i)).toBeVisible();
  await conflictReview.getByRole('button', { name: 'Confirm: Keep the first memory' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    conflictReview.getByText('No memories need conflict review right now.'),
  ).toBeVisible();
  await expect(
    conflictReview.getByText('Conflict resolved. Story Keeper refreshed the latest story state.'),
  ).toBeVisible();
  await expect(pendingMemory.getByRole('heading', { name: 'Favorite place' })).toHaveCount(1);
  await expect(pendingMemory.getByText('The private garden', { exact: true })).toBeVisible();
  await expect(pendingMemory.getByText('The old market square', { exact: true })).toHaveCount(0);
  const survivingFact = pendingMemory
    .getByRole('heading', { name: 'Favorite place' })
    .locator('..');
  await expect(survivingFact.getByText('Pending memory', { exact: true })).toBeVisible();
  await survivingFact.getByText('Source details').click();
  await expect(survivingFact.getByText('Supported by 1 interview source.')).toBeVisible();

  const gardenSound = pendingMemory.getByRole('heading', { name: 'Garden sound' }).locator('..');
  await gardenSound.getByRole('button', { name: 'Approve Garden sound' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    pendingMemory.getByText('Memory approved. Story Keeper refreshed the latest story state.'),
  ).toBeVisible();
  const approvedGardenSound = pendingMemory
    .getByRole('heading', { name: 'Garden sound' })
    .locator('..');
  await expect(approvedGardenSound.getByText('Approved memory')).toBeVisible();
  await expect(
    approvedGardenSound.getByRole('button', { name: 'Revoke approval for Garden sound' }),
  ).toBeVisible();
  await expect(
    approvedGardenSound.getByRole('button', { name: /Remove pending memory/i }),
  ).toHaveCount(0);
  const nextQuestion = await page.locator('.current-question').textContent();
  expect(nextQuestion).toBeTruthy();
  expect(nextQuestion).not.toBe(firstQuestion);

  const browserPersistence = await page.evaluate(
    async (privateAnswer) => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      indexedDbNames: await window.indexedDB
        .databases()
        .then((databases) => databases.flatMap(({ name }) => (name === undefined ? [] : [name]))),
      url: window.location.href,
      privateAnswer,
    }),
    rawAnswer,
  );
  expect(browserPersistence.local).not.toContain(rawAnswer);
  expect(browserPersistence.session).not.toContain(rawAnswer);
  expect(browserPersistence.indexedDbNames).toEqual([]);
  expect(browserPersistence.url).not.toContain(encodeURIComponent(rawAnswer));

  await page.getByLabel('Inspect memory as').selectOption('maya');
  await expect(page.getByText('Viewing Maya’s approved family memory.')).toBeVisible();
  await expect(page.getByText(/organizing the memory/i)).not.toBeVisible();
  await expect(page.getByText('The private garden')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs clarification' })).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Memories that need review' })).not.toBeVisible();
  await expect(page.getByText('Raj', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Devika', { exact: true })).not.toBeVisible();
  await expect(page.getByText(/Possible person|remains unresolved/)).not.toBeVisible();
  await expect(page.getByText(/From Rosa’s interview/)).toHaveCount(0);
  await expect(page.getByText(/Viewing as/)).toContainText('Maya');
  await expect(page.getByText(/Approved family view/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Moved near the old market' })).toBeVisible();
  const mayaFamilyMemory = page.getByRole('region', { name: 'Approved family memories' });
  const mayaGardenSound = mayaFamilyMemory
    .getByRole('heading', { name: 'Garden sound' })
    .locator('..');
  await expect(mayaGardenSound.getByText('The garden gate in the evening breeze')).toBeVisible();
  await expect(mayaGardenSound.getByText('Approved memory')).toBeVisible();
  await mayaGardenSound.getByText('Source details').click();
  await expect(mayaGardenSound.getByText('Supported by 1 interview source.')).toBeVisible();
  await expect(
    mayaFamilyMemory.getByRole('button', { name: /approve|reject|revoke|remove/i }),
  ).toHaveCount(0);
  const queuedQuestionText = 'What was your first job?';
  const privateDraft = 'Maya private unsent draft';
  await expect(page.getByRole('heading', { name: 'Ask Rosa a question' })).toBeVisible();
  await page.getByLabel('What would you like Rosa to talk about?').fill(queuedQuestionText);
  await page.getByRole('button', { name: 'Send question' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Question added for Rosa.')).toBeVisible();
  await expect(page.getByLabel('What would you like Rosa to talk about?')).toHaveValue('');
  await expect(page.getByText(queuedQuestionText, { exact: true })).toHaveCount(0);
  await page.getByLabel('What would you like Rosa to talk about?').fill(privateDraft);
  await page.screenshot({ path: testInfo.outputPath('phase-7-820.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('phase-7-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 820, height: 900 });

  const questionPersistence = await page.evaluate(
    async ({ queuedQuestion, draft }) => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      indexedDbNames: await window.indexedDB
        .databases()
        .then((databases) => databases.flatMap(({ name }) => (name === undefined ? [] : [name]))),
      url: window.location.href,
      queuedQuestion,
      draft,
    }),
    { queuedQuestion: queuedQuestionText, draft: privateDraft },
  );
  expect(questionPersistence.local).not.toContain(queuedQuestionText);
  expect(questionPersistence.local).not.toContain(privateDraft);
  expect(questionPersistence.session).not.toContain(queuedQuestionText);
  expect(questionPersistence.session).not.toContain(privateDraft);
  expect(questionPersistence.indexedDbNames).toEqual([]);
  expect(questionPersistence.url).not.toContain(encodeURIComponent(queuedQuestionText));
  expect(questionPersistence.url).not.toContain(encodeURIComponent(privateDraft));

  await page.getByLabel('Inspect memory as').selectOption('rosa');
  await expect(page.getByText('Viewing Rosa’s narrator memory.')).toBeVisible();
  await expect(page.getByText(privateDraft, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Question added for Rosa.')).toHaveCount(0);
  const rosaMemoryAfterReturn = page.getByRole('region', { name: 'Review story memories' });
  const eveningEvent = rosaMemoryAfterReturn
    .getByRole('heading', { name: 'Evenings by the garden gate' })
    .locator('..');
  await eveningEvent
    .getByRole('button', { name: 'Remove pending memory Evenings by the garden gate' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    rosaMemoryAfterReturn.getByRole('heading', {
      name: 'Remove pending memory Evenings by the garden gate?',
    }),
  ).toBeVisible();
  await eveningEvent
    .getByRole('button', {
      name: 'Confirm pending memory removal for Evenings by the garden gate',
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    rosaMemoryAfterReturn.getByText(
      'Pending memory removed. Story Keeper refreshed the latest story state.',
    ),
  ).toBeVisible();
  await expect(
    rosaMemoryAfterReturn.getByRole('heading', { name: 'Evenings by the garden gate' }),
  ).toHaveCount(0);
  await expect(rosaMemoryAfterReturn.getByRole('heading', { name: 'Garden sound' })).toBeVisible();

  await page.getByRole('button', { name: 'Start / Resume interview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.current-question')).toHaveText(nextQuestion ?? '');
  await page.getByLabel('Rosa’s answer').fill('I remember that part more clearly now.');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  const surfacedFamilyQuestion = `Maya left you a question. They asked: “${queuedQuestionText}”`;
  await expect(page.locator('.current-question')).toHaveText(surfacedFamilyQuestion);
  await page.getByLabel('Rosa’s answer').fill('My first job was helping at the railway office.');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.locator('.current-question')).not.toHaveText(surfacedFamilyQuestion);
  const questionAfterFamilyAnswer = await page.locator('.current-question').textContent();
  expect(questionAfterFamilyAnswer).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Connect' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('15 tools verified')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs clarification' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Raj' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Devika' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start / Resume interview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.current-question')).toHaveText(questionAfterFamilyAnswer ?? '');
  await expect(page.locator('.current-question')).not.toHaveText(surfacedFamilyQuestion);
  await expect(page.getByText('No memories need conflict review right now.')).toBeVisible();

  const chapterTopic = 'Rosa’s early years beside the old market';
  const chapterBody =
    'Rosa remembered the private garden beside the old market, where the evening gate moved in the breeze.';
  const chapterStudio = page.getByRole('region', { name: 'Create a chapter' });
  await expect(chapterStudio).toBeVisible();
  await chapterStudio.getByLabel('What should this chapter focus on?').fill(chapterTopic);
  await chapterStudio.getByRole('button', { name: 'Generate chapter' }).focus();
  await page.keyboard.press('Enter');
  await expect(chapterStudio.getByText('Chapter request accepted.')).toBeVisible();
  await expect(chapterStudio.getByText('Generating', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Connect' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('15 tools verified')).toBeVisible();
  const recoveredChapterStudio = page.getByRole('region', { name: 'Create a chapter' });
  await expect(
    recoveredChapterStudio.getByRole('heading', { name: 'Beside the Old Market' }),
  ).toBeVisible();
  await expect(recoveredChapterStudio.getByText(chapterBody)).toBeVisible();
  await recoveredChapterStudio.getByText('Supported by 2 approved sources').click();
  await expect(
    recoveredChapterStudio.getByText(/garden sound: The garden gate in the evening breeze/i),
  ).toBeVisible();
  await expect(recoveredChapterStudio.getByText(/Moved near the old market/)).toBeVisible();
  await expect(recoveredChapterStudio.getByText(/00000000-/)).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath('phase-8-review-820.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('phase-8-review-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 820, height: 900 });

  const chapterPersistence = await page.evaluate(
    async ({ topic, body }) => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      indexedDbNames: await window.indexedDB
        .databases()
        .then((databases) => databases.flatMap(({ name }) => (name === undefined ? [] : [name]))),
      url: window.location.href,
      topic,
      body,
    }),
    { topic: chapterTopic, body: chapterBody },
  );
  expect(chapterPersistence.local).not.toContain(chapterTopic);
  expect(chapterPersistence.local).not.toContain(chapterBody);
  expect(chapterPersistence.session).not.toContain(chapterTopic);
  expect(chapterPersistence.session).not.toContain(chapterBody);
  expect(chapterPersistence.indexedDbNames).toEqual([]);
  expect(chapterPersistence.url).not.toContain(encodeURIComponent(chapterTopic));

  await recoveredChapterStudio.getByRole('button', { name: 'Approve chapter' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    recoveredChapterStudio.getByText(
      'Chapter approved. Story Keeper refreshed the latest family story.',
    ),
  ).toBeVisible();
  const rosaFamilyStory = page.getByRole('region', { name: 'Review story memories' });
  await expect(
    rosaFamilyStory.getByRole('heading', { name: 'Beside the Old Market' }),
  ).toBeVisible();
  await expect(rosaFamilyStory.getByText(chapterBody)).toBeVisible();

  await page.getByLabel('Inspect memory as').selectOption('maya');
  await expect(page.getByText('Viewing Maya’s approved family memory.')).toBeVisible();
  const mayaApprovedStory = page.getByRole('region', { name: 'Approved family memories' });
  await expect(
    mayaApprovedStory.getByRole('heading', { name: 'Beside the Old Market' }),
  ).toBeVisible();
  await expect(mayaApprovedStory.getByText(chapterBody)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Create a chapter' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Approve chapter|Reject chapter/ })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('15 tools verified')).toBeVisible();
  await page.getByLabel('Inspect memory as').selectOption('maya');
  const reloadedMayaStory = page.getByRole('region', { name: 'Approved family memories' });
  await expect(
    reloadedMayaStory.getByRole('heading', { name: 'Beside the Old Market' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Create a chapter' })).toHaveCount(0);

  await page.getByLabel('Inspect memory as').selectOption('rosa');
  const failureTopic = 'A chapter that cannot be generated';
  const failureStudio = page.getByRole('region', { name: 'Create a chapter' });
  await failureStudio.getByLabel('What should this chapter focus on?').fill(failureTopic);
  await failureStudio.getByRole('button', { name: 'Generate chapter' }).click();
  await expect(
    failureStudio.getByRole('heading', { name: 'This chapter couldn’t be generated' }),
  ).toBeVisible();
  await expect(failureStudio.getByText(/Private provider details remain hidden/)).toBeVisible();
  await expect(
    failureStudio.getByText(/INVALID_CHAPTER_OUTPUT|ZodError|draft_chapter|retry count|worker/i),
  ).toHaveCount(0);

  const searchQuery = 'old market';
  const privateSearchDraft = 'Maya private search draft';
  await page.getByRole('button', { name: 'Open search' }).click();
  await expect(
    page.getByRole('heading', { name: 'Search family stories', level: 1 }),
  ).toBeVisible();
  const searchInput = page.getByRole('searchbox', { name: 'Search family stories' });
  await searchInput.fill(searchQuery);
  await page.getByRole('button', { name: 'Search', exact: true }).focus();
  await page.keyboard.press('Enter');
  const searchResults = page.getByRole('list', { name: 'Family story search results' });
  await expect(
    searchResults.getByRole('heading', { name: 'Moved near the old market' }),
  ).toBeVisible();
  await expect(searchResults.getByRole('heading', { name: 'Beside the Old Market' })).toBeVisible();
  const rosaSearchOrder = await searchResults
    .getByRole('listitem')
    .getByRole('heading')
    .allTextContents();
  expect(rosaSearchOrder).toHaveLength(2);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(searchResults.getByRole('listitem')).toHaveCount(2);
  expect(await searchResults.getByRole('listitem').getByRole('heading').allTextContents()).toEqual(
    rosaSearchOrder,
  );

  await searchInput.fill('square');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No matching family stories found.')).toBeVisible();
  await expect(page.getByText('The old market square', { exact: true })).toHaveCount(0);
  await searchInput.fill('Devika');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No matching family stories found.')).toBeVisible();
  await searchInput.fill('" * ( )');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('at least one letter or number');
  await expect(page.getByText(/SQLite|FTS5|MATCH syntax|SEARCH_QUERY_INVALID/i)).toHaveCount(0);

  await searchInput.fill(searchQuery);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(searchResults.getByRole('listitem')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('phase-9-search-820.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('phase-9-search-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 820, height: 900 });

  await page.getByLabel('Search as').selectOption('maya');
  await expect(searchInput).toHaveValue('');
  await expect(page.getByRole('list', { name: 'Family story search results' })).toHaveCount(0);
  await expect(page.getByText('Enter a search to begin.')).toBeVisible();
  await searchInput.fill(searchQuery);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(searchResults.getByRole('listitem')).toHaveCount(2);
  expect(await searchResults.getByRole('listitem').getByRole('heading').allTextContents()).toEqual(
    rosaSearchOrder,
  );

  const searchPersistence = await page.evaluate(
    async ({ query, privateSnippet }) => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      indexedDbNames: await window.indexedDB
        .databases()
        .then((databases) => databases.flatMap(({ name }) => (name === undefined ? [] : [name]))),
      url: window.location.href,
      query,
      privateSnippet,
    }),
    { query: searchQuery, privateSnippet: chapterBody },
  );
  expect(searchPersistence.local).not.toContain(searchQuery);
  expect(searchPersistence.local).not.toContain(chapterBody);
  expect(searchPersistence.session).not.toContain(searchQuery);
  expect(searchPersistence.session).not.toContain(chapterBody);
  expect(searchPersistence.indexedDbNames).toEqual([]);
  expect(searchPersistence.url).not.toContain(encodeURIComponent(searchQuery));

  await searchInput.fill(privateSearchDraft);
  await page.reload();
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('15 tools verified')).toBeVisible();
  await page.getByRole('button', { name: 'Open search' }).click();
  const reloadedSearchInput = page.getByRole('searchbox', { name: 'Search family stories' });
  await expect(reloadedSearchInput).toHaveValue('');
  await expect(page.getByText(privateSearchDraft, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Family story search results' })).toHaveCount(0);
  await page.getByLabel('Search as').selectOption('maya');
  await reloadedSearchInput.fill(searchQuery);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Search as').selectOption('rosa');
  await page.getByRole('button', { name: 'Open interview' }).click();

  await page
    .getByRole('region', { name: 'Review story memories' })
    .getByRole('button', { name: 'Approve Child relationship' })
    .first()
    .click();
  await expect(
    page.getByText('Memory approved. Story Keeper refreshed the latest story state.'),
  ).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'Needs clarification' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('http://localhost:4174/');
  await expect(page).toHaveTitle('Story Keeper Timeline');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect and load timeline' }).click();
  await expect(page.getByText('Timeline loaded from Story Keeper.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Moved near the old market' })).toBeVisible();
  await expect(page.getByText('1962–1964')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('phase-10-timeline-1440.png'),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 820, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('phase-10-timeline-820.png'), fullPage: true });

  await page.goto('http://localhost:4175/');
  await expect(page).toHaveTitle('Story Keeper Family Tree');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect and load family tree' }).click();
  await expect(page.getByText('Family tree loaded from Story Keeper.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rosa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maya' })).toBeVisible();
  await expect(page.getByText(/Child · 1 source/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('phase-10-family-tree-820.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('phase-10-family-tree-1440.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('http://localhost:4176/');
  await expect(page).toHaveTitle('Story Keeper Chapter Review');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect and load chapters' }).click();
  await expect(page.getByText('Approved chapters loaded from Story Keeper.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Beside the Old Market' })).toBeVisible();
  await expect(page.getByText(chapterBody)).toBeVisible();
  await expect(page.getByRole('button', { name: /approve|reject|request changes/i })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('phase-10-chapters-820.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('phase-10-chapters-1440.png'),
    fullPage: true,
  });

  expect(consoleMessages.join('\n')).not.toContain(rawAnswer);
  expect(consoleMessages.join('\n')).not.toContain(queuedQuestionText);
  expect(consoleMessages.join('\n')).not.toContain(privateDraft);
  expect(consoleMessages.join('\n')).not.toContain(chapterTopic);
  expect(consoleMessages.join('\n')).not.toContain(chapterBody);
  expect(consoleMessages.join('\n')).not.toContain(failureTopic);
  expect(consoleMessages.join('\n')).not.toContain(searchQuery);
  expect(consoleMessages.join('\n')).not.toContain(privateSearchDraft);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
