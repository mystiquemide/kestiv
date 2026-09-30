import { CtaPill } from "./CtaPill";
import { NavLogo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";

export function Nav() {
  return (
    <header className="sticky top-3 z-50 h-0">
      <div className="container-k relative">
        <div className="flex h-[60px] items-center justify-between rounded-[30px] border border-line bg-canvas pr-2 pl-5">
          <NavLogo />
          <NavLinks />
          <CtaPill className="hidden md:inline-flex" />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
