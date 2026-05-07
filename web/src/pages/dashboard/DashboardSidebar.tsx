import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `gum-nav__link${isActive ? " gum-nav__link--active" : ""}`;

export function DashboardSidebar() {
  return (
    <aside className="gum-sidebar">
      <nav className="gum-nav">
        <NavLink to="/dashboard/home" className={linkClass} end>
          <span className="gum-nav__ico" aria-hidden>
            H
          </span>
          Home
        </NavLink>
        <NavLink to="/dashboard/products" className={linkClass}>
          <span className="gum-nav__ico gum-nav__ico--svg" aria-hidden>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="gum-nav__svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"
              />
            </svg>
          </span>
          Products
        </NavLink>
        <NavLink to="/dashboard/payment" className={linkClass}>
          <span className="gum-nav__ico" aria-hidden>
            $
          </span>
          Payments
        </NavLink>
      </nav>
      <div className="gum-sidebar__divider" />
      <nav className="gum-nav gum-nav--secondary">
        <NavLink to="/dashboard/purchases" className={linkClass}>
          <span className="gum-nav__ico gum-nav__ico--svg" aria-hidden>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 512"
              className="gum-nav__svg"
              fill="currentColor"
            >
              <path d="M0 8C0-5.3 10.7-16 24-16l45.3 0c27.1 0 50.3 19.4 55.1 46l.4 2 412.7 0c20 0 35.1 18.2 31.4 37.9L537.8 235.8c-5.7 30.3-32.1 52.2-62.9 52.2l-303.6 0 5.1 28.3c2.1 11.4 12 19.7 23.6 19.7L456 336c13.3 0 24 10.7 24 24s-10.7 24-24 24l-255.9 0c-34.8 0-64.6-24.9-70.8-59.1L77.2 38.6c-.7-3.8-4-6.6-7.9-6.6L24 32C10.7 32 0 21.3 0 8zM160 464a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm224 0a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM336 78.4c-13.3 0-24 10.7-24 24l0 33.6-33.6 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l33.6 0 0 33.6c0 13.3 10.7 24 24 24s24-10.7 24-24l0-33.6 33.6 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-33.6 0 0-33.6c0-13.3-10.7-24-24-24z" />
            </svg>
          </span>
          Purchases
        </NavLink>
        <NavLink to="/dashboard/discover" className={linkClass}>
          <span className="gum-nav__ico gum-nav__ico--svg" aria-hidden>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 512 512"
              className="gum-nav__svg"
              fill="currentColor"
            >
              <path d="M351.9 280l-190.9 0c2.9 64.5 17.2 123.9 37.5 167.4 11.4 24.5 23.7 41.8 35.1 52.4 11.2 10.5 18.9 12.2 22.9 12.2s11.7-1.7 22.9-12.2c11.4-10.6 23.7-28 35.1-52.4 20.3-43.5 34.6-102.9 37.5-167.4zM160.9 232l190.9 0C349 167.5 334.7 108.1 314.4 64.6 303 40.2 290.7 22.8 279.3 12.2 268.1 1.7 260.4 0 256.4 0s-11.7 1.7-22.9 12.2c-11.4 10.6-23.7 28-35.1 52.4-20.3 43.5-34.6 102.9-37.5 167.4zm-48 0C116.4 146.4 138.5 66.9 170.8 14.7 78.7 47.3 10.9 131.2 1.5 232l111.4 0zM1.5 280c9.4 100.8 77.2 184.7 169.3 217.3-32.3-52.2-54.4-131.7-57.9-217.3L1.5 280zm398.4 0c-3.5 85.6-25.6 165.1-57.9 217.3 92.1-32.7 159.9-116.5 169.3-217.3l-111.4 0zm111.4-48C501.9 131.2 434.1 47.3 342 14.7 374.3 66.9 396.4 146.4 399.9 232l111.4 0z" />
            </svg>
          </span>
          Discover
        </NavLink>
      </nav>
    </aside>
  );
}
