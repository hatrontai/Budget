import { validateExpense, type Expense, type ExpenseInput } from './shared';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEET = 'ChiTieu';
const HEADER = ['id', 'spent_on', 'amount_vnd', 'description', 'category', 'created_at', 'deleted_at'];
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken(options?: { prompt?: string }): void }
interface GoogleIdentity {
  accounts: { oauth2: { initTokenClient(options: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: (error: unknown) => void }): TokenClient } };
}
declare global { interface Window { google?: GoogleIdentity } }

let accessToken = '';
let spreadsheetId = '';
let tokenExpiry = 0;

export class DriveAuthError extends Error {}

function authorize(): Promise<void> {
  if (!CLIENT_ID) return Promise.reject(new Error('Chưa cấu hình Google Client ID. Xem README để thiết lập ứng dụng.'));
  if (!window.google?.accounts.oauth2) return Promise.reject(new Error('Không tải được dịch vụ đăng nhập Google. Hãy kiểm tra kết nối mạng và thử lại.'));
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) { reject(new Error(response.error || 'Bạn chưa cấp quyền truy cập Drive.')); return; }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + Math.max(0, Number(response.expires_in ?? 3600) - 60) * 1000;
        resolve();
      },
      error_callback: () => reject(new Error('Không thể mở cửa sổ Google. Hãy cho phép cửa sổ bật lên và thử lại.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function googleRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken || Date.now() >= tokenExpiry) throw new DriveAuthError('Phiên Google đã hết hạn. Hãy kết nối lại.');
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { authorization: 'Bearer ' + accessToken, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  } catch { throw new Error('Không kết nối được Google Drive. Kiểm tra mạng rồi thử lại.'); }
  if (response.status === 401 || response.status === 403) {
    if (response.status === 401) { accessToken = ''; throw new DriveAuthError('Phiên Google đã hết hạn. Hãy kết nối lại.'); }
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(data.error?.message || 'Google Drive không xử lý được yêu cầu.');
  }
  return response.json() as Promise<T>;
}

function rangeUrl(id: string, range: string): string {
  return 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent(range);
}

async function createSpreadsheet(): Promise<string> {
  const created = await googleRequest<{ id: string }>('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sổ chi tiêu', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { so_chi_tieu: 'v1' } }),
  });
  return created.id;
}

async function ensureSpreadsheet(id: string): Promise<void> {
  const details = await googleRequest<{ sheets?: Array<{ properties: { sheetId: number; title: string } }> }>(
    'https://sheets.googleapis.com/v4/spreadsheets/' + id + '?fields=sheets.properties(sheetId,title)',
  );
  if (!details.sheets?.some(sheet => sheet.properties.title === SHEET)) {
    const firstSheet = details.sheets?.[0]?.properties.sheetId;
    const request = firstSheet === undefined
      ? { addSheet: { properties: { title: SHEET } } }
      : { updateSheetProperties: { properties: { sheetId: firstSheet, title: SHEET }, fields: 'title' } };
    await googleRequest('https://sheets.googleapis.com/v4/spreadsheets/' + id + ':batchUpdate', {
      method: 'POST', body: JSON.stringify({ requests: [request] }),
    });
  }
  const current = await googleRequest<{ values?: string[][] }>(rangeUrl(id, SHEET + '!A1:G1'));
  if (JSON.stringify(current.values?.[0]) !== JSON.stringify(HEADER)) {
    await googleRequest(rangeUrl(id, SHEET + '!A1:G1') + '?valueInputOption=RAW', {
      method: 'PUT', body: JSON.stringify({ values: [HEADER] }),
    });
  }
}

export async function connectGoogleDrive(): Promise<string> {
  await authorize();
  const query = "appProperties has { key = 'so_chi_tieu' and value = 'v1' } and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
  const params = new URLSearchParams({ q: query, fields: 'files(id,name),nextPageToken', orderBy: 'createdTime', pageSize: '100' });
  const listed = await googleRequest<{ files: Array<{ id: string; name: string }> }>('https://www.googleapis.com/drive/v3/files?' + params);
  spreadsheetId = listed.files?.[0]?.id || await createSpreadsheet();
  await ensureSpreadsheet(spreadsheetId);
  return 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit';
}

export function disconnectGoogleDrive(): void { accessToken = ''; tokenExpiry = 0; spreadsheetId = ''; }

interface SheetRow { row: number; expense: Expense; deleted: boolean }
async function readRows(): Promise<SheetRow[]> {
  if (!spreadsheetId) throw new DriveAuthError('Hãy kết nối lại với Google Drive.');
  const data = await googleRequest<{ values?: Array<Array<string | number>> }>(rangeUrl(spreadsheetId, SHEET + '!A2:G') + '?valueRenderOption=UNFORMATTED_VALUE');
  const rows: SheetRow[] = [];
  for (const [index, values] of (data.values ?? []).entries()) {
    if (!values[0]) continue;
    const expense: Expense = {
      id: String(values[0]), spent_on: String(values[1] ?? ''), amount_vnd: Number(values[2]),
      description: String(values[3] ?? ''), category: String(values[4] ?? ''), created_at: String(values[5] ?? ''),
    };
    if (validateExpense(expense)) rows.push({ row: index + 2, expense, deleted: Boolean(values[6]) });
  }
  return rows;
}

export async function listExpenses(month?: string): Promise<Expense[]> {
  const rows = await readRows();
  return rows.filter(({ expense, deleted }) => !deleted && (!month || expense.spent_on.startsWith(month + '-')))
    .map(({ expense }) => expense).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
}

export async function addExpense(input: ExpenseInput): Promise<void> {
  const valid = validateExpense(input);
  if (!valid) throw new Error('Thông tin khoản chi không hợp lệ.');
  const item: Expense = { ...valid, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  await googleRequest(rangeUrl(spreadsheetId, SHEET + '!A:G') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
    method: 'POST', body: JSON.stringify({ values: [[item.id, item.spent_on, item.amount_vnd, item.description, item.category, item.created_at, '']] }),
  });
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const valid = validateExpense(input);
  if (!valid) throw new Error('Thông tin khoản chi không hợp lệ.');
  const found = (await readRows()).find(({ expense, deleted }) => expense.id === id && !deleted);
  if (!found) throw new Error('Không tìm thấy khoản chi. Hãy tải lại dữ liệu.');
  const values = [[id, valid.spent_on, valid.amount_vnd, valid.description, valid.category, found.expense.created_at, '']];
  await googleRequest(rangeUrl(spreadsheetId, SHEET + '!A' + found.row + ':G' + found.row) + '?valueInputOption=RAW', {
    method: 'PUT', body: JSON.stringify({ values }),
  });
}

export async function deleteExpense(id: string): Promise<void> {
  const found = (await readRows()).find(({ expense, deleted }) => expense.id === id && !deleted);
  if (!found) throw new Error('Không tìm thấy khoản chi. Hãy tải lại dữ liệu.');
  await googleRequest(rangeUrl(spreadsheetId, SHEET + '!G' + found.row) + '?valueInputOption=RAW', {
    method: 'PUT', body: JSON.stringify({ values: [[new Date().toISOString()]] }),
  });
}
