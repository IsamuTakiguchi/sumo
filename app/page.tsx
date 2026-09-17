import { StudioShell } from '@/components/StudioShell';

// ページ自体はサーバーコンポーネントのまま。
// Web Audio・Canvas・localStorage を触る部分はすべて StudioShell 以下のクライアント側にある。
export default function Home() {
  return (
    <main>
      <StudioShell />
    </main>
  );
}
