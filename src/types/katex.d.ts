declare module 'katex/contrib/auto-render' {
  function renderMathInElement(
    element: HTMLElement,
    options?: {
      delimiters?: Array<{
        left: string;
        right: string;
        display: boolean;
      }>;
      ignoredTags?: string[];
      ignoredClasses?: string[];
      throwOnError?: boolean;
      strict?: boolean | string | ((errorCode: string) => void);
      trust?: boolean | ((context: { command: string; url: string }) => boolean);
      macros?: Record<string, string>;
    }
  ): void;

  export default renderMathInElement;
}
