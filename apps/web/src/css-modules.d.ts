// `apps/web/tsconfig.json`'s `include` array does not list `next-env.d.ts`
// (only `app`, `src` and `.next/types/**/*.ts`), so the ambient `*.module.css`
// declaration that `next`'s own global.d.ts provides is invisible to a plain
// `tsc --noEmit` run even though `next build`'s internal type-check picks it
// up. This file (under `src`, which IS included) restates that one
// declaration so `apps/web/app/login/login.module.css` type-checks the same
// way under both commands.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
