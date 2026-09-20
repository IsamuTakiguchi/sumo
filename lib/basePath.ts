/**
 * サブパス配下で公開するときのプレフィックス。
 *
 * Next.js は <Link> や静的アセットには basePath を自動で付けるが、
 * 素の fetch には付けない。API を叩くときはここを前置する。
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
