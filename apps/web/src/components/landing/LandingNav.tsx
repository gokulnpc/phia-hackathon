import Link from "next/link";

export function LandingNav() {
  return (
    <header className="relative z-20 flex items-center justify-between bg-transparent px-6 py-6 sm:px-10">
      <Link href="/" className="eyebrow text-ink">
        Mirror
      </Link>
      <nav>
        <Link
          href="/feed"
          className="inline-flex rounded-full border border-ink bg-transparent px-5 py-2 text-center text-[13px] font-medium text-ink transition-colors hover:bg-ink hover:text-white"
        >
          Open app
        </Link>
      </nav>
    </header>
  );
}
