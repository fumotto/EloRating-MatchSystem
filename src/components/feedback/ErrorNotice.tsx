// エラー表示（05_Frontend.md 12章）。
// ★受け取るのはエラーコードであり、バックエンドの message ではない。
import { errorMessage } from "../../utils/errorMessage";

interface ErrorNoticeProps {
  code?: string;
}

export function ErrorNotice({ code }: ErrorNoticeProps) {
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {errorMessage(code)}
    </p>
  );
}
