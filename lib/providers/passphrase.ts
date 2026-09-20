/**
 * AI 生成を使うための合い言葉。
 *
 * サーバーの APP_PASSPHRASE と照合される。端末に残して毎回の入力を省く。
 * これは「あなたの API キーで見知らぬ人に曲を作られない」ための入口の鍵であって、
 * 暗号的な秘密ではない。API キー自体はサーバーから出ない。
 *
 * localStorage が使えない環境（プライベートウィンドウなど）でも、
 * そのセッション中は入力した値で生成できるようメモリにも持つ。
 */

const KEY = 'sumo.passphrase.v1';

let current: string | null = null;

export function readPassphrase(): string {
  if (current !== null) return current;
  if (typeof localStorage === 'undefined') return '';
  try {
    current = localStorage.getItem(KEY) ?? '';
  } catch {
    current = '';
  }
  return current;
}

export function writePassphrase(value: string): void {
  current = value;
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくてもメモリ側が効くので、そのセッションでは使える
  }
}
