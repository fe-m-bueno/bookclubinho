import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface BookSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
}

export function BookSearchBar({ value, onChange, loading }: BookSearchBarProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar livro por título ou autor..."
        className="h-11 pl-10 pr-10"
        aria-label="Buscar livro"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-3 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
