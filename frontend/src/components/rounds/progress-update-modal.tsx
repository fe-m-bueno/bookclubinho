"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";

interface ProgressUpdateModalProps {
  roundId: string;
  bookPageCount: number | null;
  currentPage: number | null;
  currentPercentage: number;
  onUpdated: () => void;
  onFinished?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProgressUpdateModal({
  roundId,
  bookPageCount,
  currentPage,
  currentPercentage,
  onUpdated,
  onFinished,
  open,
  onOpenChange,
}: ProgressUpdateModalProps) {
  const [tab, setTab] = useState<"page" | "chapter" | "percentage">("page");
  const [pageInput, setPageInput] = useState(String(currentPage ?? 0));
  const [chapterInput, setChapterInput] = useState("");
  const [totalChaptersInput, setTotalChaptersInput] = useState("");
  const [percentage, setPercentage] = useState(Math.round(currentPercentage));
  const [note, setNote] = useState("");

  const pageValue = Math.min(
    bookPageCount ?? Infinity,
    Math.max(0, parseInt(pageInput, 10) || 0),
  );

  const chapterNum = Math.max(0, parseInt(chapterInput, 10) || 0);
  const totalChapters = parseInt(totalChaptersInput, 10) || 0;
  const chapterPct =
    chapterNum > 0 && totalChapters > 0
      ? Math.min(100, Math.round((chapterNum / totalChapters) * 100))
      : null;

  const computedPagePct =
    bookPageCount && bookPageCount > 0
      ? Math.round((pageValue / bookPageCount) * 100)
      : null;

  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/progress`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Progresso atualizado!");
      onUpdated();
      onOpenChange(false);
    },
  });

  const { submit: submitFinish, loading: finishLoading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/progress`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Parabéns! Você terminou o livro! 🎉");
      onUpdated();
      onFinished?.();
      onOpenChange(false);
    },
  });

  const handleSave = () => {
    let body: Record<string, unknown>;

    if (tab === "page") {
      body = {
        current_page: pageValue,
        progress_type: "page",
        ...(bookPageCount ? { total_pages: bookPageCount } : {}),
        ...(note ? { note } : {}),
      };
    } else if (tab === "chapter") {
      body = {
        current_page: chapterNum,
        progress_type: "chapter",
        ...(chapterPct !== null ? { percentage: chapterPct } : {}),
        ...(note ? { note } : {}),
      };
    } else {
      body = {
        percentage,
        progress_type: "percentage",
        ...(note ? { note } : {}),
      };
    }

    submit(JSON.stringify(body));
  };

  const handleFinish = () => {
    const body = bookPageCount
      ? {
          current_page: bookPageCount,
          progress_type: "finished",
          ...(note ? { note } : {}),
        }
      : {
          percentage: 100,
          progress_type: "finished",
          ...(note ? { note } : {}),
        };
    submitFinish(JSON.stringify(body));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Atualizar Progresso</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Progresso atual: {Math.round(currentPercentage)}%
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="page">Página</TabsTrigger>
            <TabsTrigger value="chapter">Capítulo</TabsTrigger>
            <TabsTrigger value="percentage">%</TabsTrigger>
          </TabsList>

          {/* Tab: Página */}
          <TabsContent value="page" className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label htmlFor="current-page">
                Página atual
                {bookPageCount && (
                  <span className="text-muted-foreground font-normal">
                    {" "}(de {bookPageCount})
                  </span>
                )}
              </Label>
              <Input
                id="current-page"
                type="number"
                inputMode="numeric"
                min={0}
                max={bookPageCount ?? undefined}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setPageInput(String(pageValue))}
                className="min-h-[44px] text-base"
              />
              {computedPagePct !== null && (
                <p className="text-sm text-muted-foreground">
                  {computedPagePct}% concluído
                </p>
              )}
            </div>
          </TabsContent>

          {/* Tab: Capítulo */}
          <TabsContent value="chapter" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="chapter-input">Capítulo atual</Label>
                <Input
                  id="chapter-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={chapterInput}
                  onChange={(e) => setChapterInput(e.target.value)}
                  className="min-h-[44px] text-base"
                  placeholder="ex: 12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total-chapters">Total (opcional)</Label>
                <Input
                  id="total-chapters"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={totalChaptersInput}
                  onChange={(e) => setTotalChaptersInput(e.target.value)}
                  className="min-h-[44px] text-base"
                  placeholder="ex: 30"
                />
              </div>
            </div>
            {chapterPct !== null && (
              <p className="text-sm text-muted-foreground">
                {chapterPct}% concluído
              </p>
            )}
          </TabsContent>

          {/* Tab: Porcentagem */}
          <TabsContent value="percentage" className="space-y-3 pt-2">
            <div className="space-y-3">
              <Label>
                Porcentagem concluída:{" "}
                <span className="font-semibold">{percentage}%</span>
              </Label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[percentage]}
                onValueChange={([v]) => setPercentage(v)}
                className="w-full"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Nota */}
        <div className="space-y-2">
          <Label htmlFor="progress-note">
            Nota{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Textarea
            id="progress-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="O que achou até aqui?"
            className="resize-none text-sm"
            rows={2}
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleSave}
            disabled={loading || finishLoading}
            className="w-full min-h-[44px]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full min-h-[44px]"
                disabled={loading || finishLoading}
              >
                🎉 Terminei!
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Terminou o livro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Seu progresso será marcado como 100%. Parabéns!
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleFinish}>
                  {finishLoading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
