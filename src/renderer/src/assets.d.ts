declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.css" {
  const stylesheet: string;
  export default stylesheet;
}

declare module "streamdown/styles.css" {
  const stylesheet: string;
  export default stylesheet;
}

declare module "katex/dist/katex.min.css" {
  const stylesheet: string;
  export default stylesheet;
}
