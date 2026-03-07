'use client';

import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useState,
} from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from 'shiki';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
  highlightLines?: { line: number; color: string }[];
};

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
});

const lineNumberTransformer: ShikiTransformer = {
  name: 'line-numbers',
  line(node, line) {
    node.children.unshift({
      type: 'element',
      tagName: 'span',
      properties: {
        className: [
          'inline-block',
          'min-w-10',
          'mr-4',
          'text-right',
          'select-none',
          'text-muted-foreground',
        ],
      },
      children: [{ type: 'text', value: String(line) }],
    });
  },
};

const createHighlightTransformer = (
  highlights: { line: number; color: string }[]
): ShikiTransformer => ({
  name: 'line-highlight',
  line(node, line) {
    const highlight = highlights.find((h) => h.line === line);
    if (highlight) {
      if (!node.properties.className) node.properties.className = [];
      const classList = node.properties.className as string[];
      classList.push('w-full', 'inline-block');
      node.properties.style = cn(
        node.properties.style as string,
        `background-color: ${highlight.color}`
      );
    }
  },
});

export async function highlightCode(
  code: string,
  language: BundledLanguage,
  showLineNumbers = false,
  highlightLines: { line: number; color: string }[] = []
) {
  const transformers: ShikiTransformer[] = [];
  if (showLineNumbers) transformers.push(lineNumberTransformer);
  if (highlightLines.length > 0)
    transformers.push(createHighlightTransformer(highlightLines));

  return await Promise.all([
    codeToHtml(code, {
      lang: language,
      theme: 'one-light',
      transformers,
    }),
    codeToHtml(code, {
      lang: language,
      theme: 'one-dark-pro',
      transformers,
    }),
  ]);
}

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  highlightLines = [],
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const [html, setHtml] = useState<string>('');
  const [darkHtml, setDarkHtml] = useState<string>('');

  useEffect(() => {
    highlightCode(code, language, showLineNumbers, highlightLines).then(
      ([light, dark]) => {
        setHtml(light);
        setDarkHtml(dark);
      }
    );
  }, [code, language, showLineNumbers, highlightLines]);

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          'group relative w-full overflow-hidden rounded-md border bg-background text-foreground',
          className
        )}
        {...props}
      >
        <div className='relative'>
          <div
            className='overflow-auto dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm'
            // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div
            className='hidden overflow-auto dark:block [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm'
            // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
            dangerouslySetInnerHTML={{ __html: darkHtml }}
          />
          {children && (
            <div className='absolute top-2 right-2 flex items-center gap-2'>
              {children}
            </div>
          )}
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn('shrink-0', className)}
      onClick={copyToClipboard}
      size='icon'
      variant='ghost'
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};
