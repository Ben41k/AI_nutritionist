import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownComponents: Partial<Components> = {
  h1: ({ children }) => <h3 className="text-base font-semibold text-ink-heading">{children}</h3>,
  h2: ({ children }) => <h3 className="text-base font-semibold text-ink-heading">{children}</h3>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-ink-heading">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-ink-heading">{children}</h4>,
  p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-ink-muted">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:text-ink-muted">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink-heading">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-ink-body italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-border" />,
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border/80 bg-surface/80">
      <table className="w-full min-w-[12rem] border-collapse text-left text-sm text-ink-body">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink-heading/[0.04]">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/90 [&>tr:last-child>td]:border-b-0">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b-2 border-border px-2.5 py-2 text-left text-sm font-semibold text-ink-heading sm:px-3">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/80 px-2.5 py-2 text-left align-top text-sm sm:px-3">{children}</td>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className;
    if (inline) {
      return (
        <code
          className="rounded bg-ink-heading/[0.06] px-1 py-0.5 font-mono text-[0.9em] text-ink-heading"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="overflow-x-auto rounded-lg border border-border/80 bg-ink-heading/[0.04] p-3 text-[0.85em] leading-relaxed text-ink-heading">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
};

type ChatAssistantMarkdownProps = {
  text: string;
};

export function ChatAssistantMarkdown({ text }: ChatAssistantMarkdownProps) {
  return (
    <div className="flex flex-col gap-3 text-ink-body [&_pre]:my-0 [&_blockquote]:my-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
