"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";

interface UpdateProgressDrawerProps {
  roundId: string;
  bookPageCount: number | null;
  currentPage: number | null;
  onUpdated: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateProgressDrawer({
  roundId,
  bookPageCount,
  currentPage,
  onUpdated,
  open,
  onOpenChange,
}: UpdateProgressDrawerProps) {
  const [pageInput, setPageInput] = useState<string>(String(currentPage ?? 0));
  const [percentage, setPercentage] = useState<number>(0);

  // Sync state when the drawer reopens with fresh currentPage
  useEffect(() => {
    if (open) {
      setPageInput(String(currentPage ?? 0));
    }
  }, [open, currentPage]);

  const pageValue = Math.min(
    bookPageCount ?? Infinity,
    Math.max(0, parseInt(pageInput, 10) || 0),
  );

  const computedPercentage =
    bookPageCount && bookPageCount > 0
      ? Math.round((pageValue / bookPageCount) * 100)
      : percentage;

  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/progress`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Progresso atualizado!");
      onUpdated();
      onOpenChange(false);
    },
  });

  const handleSubmit = () => {
    if (bookPageCount) {
      submit(JSON.stringify({ current_page: pageValue }));
    } else {
      submit(JSON.stringify({ percentage }));
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <div className="overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle className="text-left">Atualizar Progresso</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 space-y-5">
            {bookPageCount ? (
              <div className="space-y-2">
                <Label htmlFor="current-page">
                  Página atual{" "}
                  <span className="text-muted-foreground font-normal">
                    (de {bookPageCount})
                  </span>
                </Label>
                <Input
                  id="current-page"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={bookPageCount}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={() => setPageInput(String(pageValue))}
                  className="min-h-[44px] text-base"
                />
                <p className="text-sm text-muted-foreground">
                  {computedPercentage}% concluído
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Label htmlFor="percentage-slider">
                  Porcentagem concluída:{" "}
                  <span className="font-semibold">{percentage}%</span>
                </Label>
                <input
                  id="percentage-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  className="w-full h-2 accent-primary cursor-pointer"
                  style={{ minHeight: "44px" }}
                />
              </div>
            )}
          </div>

          <DrawerFooter>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full min-h-[44px]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full min-h-[44px]"
            >
              Cancelar
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
