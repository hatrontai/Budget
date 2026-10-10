import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('Google Sheets storage', () => {
  it('discovers the same Drive sheet, reads active rows, and updates by stable ID', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient: ({ callback }: { callback: (value: unknown) => void }) => ({
      requestAccessToken: () => callback({ access_token: 'test-token', expires_in: 3600 }),
    }) } } } });
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const rows = [
      ['id-1', '2026-09-30', 75000, 'Ăn trưa', 'Ăn uống', '2026-09-30T00:00:00Z', ''],
      ['id-2', '2026-09-29', 10000, 'Đã xóa', 'Khác', '2026-09-29T00:00:00Z', '2026-09-30T00:00:00Z'],
      ['id-3', '2026-10-01', 20000, 'Tháng sau', 'Khác', '2026-10-01T00:00:00Z', ''],
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined });
      const data = url.includes('/drive/v3/files?') ? { files: [{ id: 'sheet-1' }] }
        : url.includes('fields=sheets.properties') ? { sheets: [{ properties: { sheetId: 0, title: 'ChiTieu' } }] }
          : url.includes('A1%3AG1') && !init.method ? { values: [['id', 'spent_on', 'amount_vnd', 'description', 'category', 'created_at', 'deleted_at']] }
            : url.includes('/values/') && !init.method ? { values: rows }
              : {};
      return new Response(JSON.stringify(data), { status: 200 });
    }));
    const drive = await import('./googleDrive');
    expect(await drive.connectGoogleDrive()).toBe('https://docs.google.com/spreadsheets/d/sheet-1/edit');
    expect((await drive.listExpenses('2026-09')).map(item => item.id)).toEqual(['id-1']);
    await drive.updateExpense('id-1', { spent_on: '2026-09-30', amount_vnd: 80000, description: 'Ăn tối', category: 'Ăn uống' });
    await drive.deleteExpense('id-1');
    expect(calls.some(call => call.method === 'PUT' && call.url.includes('A2%3AG2') && call.body?.includes('80000'))).toBe(true);
    expect(calls.some(call => call.method === 'PUT' && call.url.includes('G2'))).toBe(true);
    expect(calls.some(call => call.url.includes('valueRenderOption=UNFORMATTED_VALUE'))).toBe(true);
  });
  it('creates a Drive spreadsheet and appends a validated expense', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient: ({ callback }: { callback: (value: unknown) => void }) => ({
      requestAccessToken: () => callback({ access_token: 'test-token', expires_in: 3600 }),
    }) } } } });
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined });
      const data = url.includes('/drive/v3/files?') && !init.method ? { files: [] }
        : url.includes('/drive/v3/files?') && init.method === 'POST' ? { id: 'new-sheet' }
          : url.includes('fields=sheets.properties') ? { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] }
            : { values: [] };
      return new Response(JSON.stringify(data), { status: 200 });
    }));
    const drive = await import('./googleDrive');
    expect(await drive.connectGoogleDrive()).toContain('new-sheet');
    await drive.addExpense({ spent_on: '2026-09-30', amount_vnd: 42000, description: 'Bữa sáng', category: 'Ăn uống' });
    expect(calls.some(call => call.method === 'POST' && call.url.includes('/drive/v3/files?') && call.body?.includes('so_chi_tieu'))).toBe(true);
    expect(calls.some(call => call.url.includes(':batchUpdate') && call.body?.includes('ChiTieu'))).toBe(true);
    expect(calls.some(call => call.method === 'POST' && call.url.includes(':append') && call.body?.includes('42000'))).toBe(true);
  });
});

it('persists budgets across sessions, updates keys, removes overrides and surfaces failed writes', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
  vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient: ({ callback }: { callback: (value: unknown) => void }) => ({ requestAccessToken: () => callback({ access_token: 'test-token', expires_in: 3600 }) }) } } } });
  let exists = false;
  let failWrites = false;
  let rows: Array<Array<string | number>> = [];
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push(url);
    let data: unknown = {};
    const range = decodeURIComponent(url);
    if (url.includes('/drive/v3/files?')) data = { files: [{ id: 'shared-sheet' }] };
    else if (url.includes('fields=sheets.properties')) data = { sheets: [{ properties: { sheetId: 0, title: 'ChiTieu' } }, ...(exists ? [{ properties: { sheetId: 1, title: 'HanMuc' } }] : [])] };
    else if (url.includes(':batchUpdate')) exists = true;
    else if (range.includes('ChiTieu!A1:G1')) data = { values: [['id', 'spent_on', 'amount_vnd', 'description', 'category', 'created_at', 'deleted_at']] };
    else if (range.includes('HanMuc!A1:D1')) data = { values: [['category', 'month', 'mode', 'limit_vnd']] };
    else if (range.includes('HanMuc!A2:D') && !init.method) data = { values: rows };
    else if (init.method && range.includes('HanMuc!')) {
      if (failWrites) return new Response(JSON.stringify({ error: { message: 'Write failed' } }), { status: 500 });
      const values = JSON.parse(init.body as string).values[0];
      if (url.includes(':append')) rows.push(values);
      else {
        const row = Number(range.match(/HanMuc!A(\d+):D/)![1]);
        rows[row - 2] = values;
      }
    } else if (url.includes(':batchClear')) {
      for (const range of JSON.parse(init.body as string).ranges) {
        const row = Number(range.match(/!A(\d+):D/)[1]);
        rows[row - 2] = [];
      }
    }
    return new Response(JSON.stringify(data), { status: 200 });
  }));
  const drive = await import('./googleDrive');
  await drive.connectGoogleDrive();
  expect(await drive.listBudgets()).toEqual([]);
  const base = { category: 'Ăn uống', month: '2026-10', mode: 'default' as const, limit_vnd: 3000000 };
  await drive.saveBudget(base);
  await drive.saveBudget({ ...base, limit_vnd: 4000000 });
  await drive.saveBudget({ ...base, mode: 'override', limit_vnd: 0 });
  drive.disconnectGoogleDrive();
  await drive.connectGoogleDrive();
  expect(await drive.listBudgets()).toEqual([{ ...base, limit_vnd: 4000000 }, { ...base, mode: 'override', limit_vnd: 0 }]);
  await drive.removeBudgetOverride(base.category, base.month);
  expect(await drive.listBudgets()).toEqual([{ ...base, limit_vnd: 4000000 }]);
  failWrites = true;
  await expect(drive.saveBudget({ ...base, limit_vnd: 1 })).rejects.toThrow('Write failed');
  expect(await drive.listBudgets()).toEqual([{ ...base, limit_vnd: 4000000 }]);
  expect(calls.some(url => decodeURIComponent(url).includes('HanMuc!'))).toBe(true);
});

it('keeps added and deleted categories across reconnects without changing expenses or budgets', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
  vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient: ({ callback }: { callback: (value: unknown) => void }) => ({ requestAccessToken: () => callback({ access_token: 'test-token', expires_in: 3600 }) }) } } } });
  let exists = false;
  let fail = false;
  const rows: Array<Array<string | boolean>> = [];
  const writes: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const range = decodeURIComponent(url);
    let data: unknown = {};
    if (url.includes('/drive/v3/files?')) data = { files: [{ id: 'sheet' }] };
    else if (url.includes('fields=sheets.properties')) data = { sheets: [{ properties: { title: 'ChiTieu', sheetId: 0 } }, ...(exists ? [{ properties: { title: 'NhomChiTieu' } }] : [])] };
    else if (url.includes(':batchUpdate')) exists = true;
    else if (range.includes('ChiTieu!A1:G1')) data = { values: [['id', 'spent_on', 'amount_vnd', 'description', 'category', 'created_at', 'deleted_at']] };
    else if (range.includes('NhomChiTieu!A2:B') && !init.method) data = { values: rows };
    else if (init.method && range.includes('NhomChiTieu!') && !range.includes('A1:B1')) {
      if (fail) return new Response(JSON.stringify({ error: { message: 'Write failed' } }), { status: 500 });
      writes.push(range);
      const values = JSON.parse(init.body as string).values[0];
      if (url.includes(':append')) rows.push(values);
      else rows[Number(range.match(/!A(\d+):B/)![1]) - 2] = values;
    }
    return new Response(JSON.stringify(data), { status: 200 });
  }));
  const drive = await import('./googleDrive');
  await drive.connectGoogleDrive();
  expect(await drive.listCategorySettings()).toEqual([]);
  await drive.saveCategorySetting(' Du lịch ', true);
  await drive.saveCategorySetting('Ăn uống', false);
  drive.disconnectGoogleDrive();
  await drive.connectGoogleDrive();
  expect(await drive.listCategorySettings()).toEqual([{ category: 'Du lịch', active: true }, { category: 'Ăn uống', active: false }]);
  await drive.saveCategorySetting('Ăn uống', true);
  expect((await drive.listCategorySettings())[1].active).toBe(true);
  expect(rows).toHaveLength(2);
  await expect(drive.saveCategorySetting('', true)).rejects.toThrow('Tên nhóm');
  fail = true;
  await expect(drive.saveCategorySetting('Du lịch', false)).rejects.toThrow('Write failed');
  expect((await drive.listCategorySettings())[0].active).toBe(true);
  expect(writes.every(url => url.includes('NhomChiTieu!'))).toBe(true);
});
