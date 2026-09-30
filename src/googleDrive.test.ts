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
