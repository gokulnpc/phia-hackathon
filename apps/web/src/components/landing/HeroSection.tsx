import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative z-10 w-full px-6 pb-40 pt-28 sm:px-10 sm:pt-32 md:pt-36">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <h1
          className="font-display w-full animate-fade-rise-delay text-5xl font-normal tracking-[-2.46px] text-ink sm:text-7xl md:text-8xl"
          style={{ lineHeight: 0.95 }}
        >
          Confidence,{" "}
          <em className="hero-underscore-mirror">mirrored.</em>
        </h1>
        <p className="body ital animate-fade-rise-delay-2 mt-8 w-full text-balance text-base text-muted sm:text-lg sm:mt-9">
          Virtual try-on on your body and social proof from people you trust
        </p>
        <div className="animate-fade-rise-delay-3 mt-12 flex w-full max-w-[21rem] flex-col gap-2.5 self-center sm:flex-row sm:gap-3">
          <Link
            href="/signup"
            className="flex flex-1 items-center justify-center rounded-full bg-ink px-3 py-2.5 text-center text-[13px] font-medium text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:bg-black hover:shadow-md active:translate-y-0"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="flex flex-1 items-center justify-center rounded-full border border-hair bg-card px-3 py-2.5 text-center text-[13px] font-medium text-ink shadow-sm transition-colors duration-150 ease-out hover:border-ink/25 hover:bg-bg2"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
