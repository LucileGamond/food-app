import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/app/ApiContext";
import { useAsync } from "@/hooks/useAsync";
import { splitSteps } from "@/lib/cooking";
import {
  DURATION_FIELDS,
  formatDuration,
  formatIngredient,
  formatNutrition,
  formatSource,
  groupBySection,
  ingredientsFor,
  servingsFromParam,
} from "@/lib/recipes";
import { cn } from "@/lib/utils";
import { LoadError } from "@/components/LoadError";
import { RecipeNotFound } from "@/components/recipes/RecipeNotFound";

/**
 * Fiche à imprimer ou à enregistrer en PDF (boîte d'impression du navigateur) : sans navigation ni boutons,
 * en noir sur blanc, quantités pour le nombre de personnes choisi sur la fiche (`?personnes=`).
 */
export function RecipePrintPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const [params] = useSearchParams();
  const { data: recipe, error, reload } = useAsync(() => api.recipes.getRecipe(id), [api, id]);
  const printed = useRef(false);

  // Boîte d'impression ouverte d'elle-même une fois la fiche affichée (une seule fois) ; le bouton la rouvre.
  const ready = Boolean(recipe?.is_saved);
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    const timeout = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  const back = `/recettes/${id}`;

  if (error) {
    return (
      <div className="p-4">
        <LoadError message={error} onRetry={reload} />
      </div>
    );
  }

  if (recipe === undefined) {
    return (
      <div
        className="space-y-4 p-4"
        aria-busy="true"
        aria-label="Chargement de la recette"
      >
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (recipe === null || !recipe.is_saved) {
    return (
      <div className="p-4">
        <RecipeNotFound />
      </div>
    );
  }

  const servings = servingsFromParam(recipe.servings, params.get("personnes"));
  const ingredients = ingredientsFor(recipe, servings);
  const times = DURATION_FIELDS.flatMap(({ label, column }) =>
    recipe[column] ? [`${label} ${formatDuration(recipe[column])}`] : [],
  );
  const meta = [
    servings !== null
      ? `${servings} ${servings > 1 ? "personnes" : "personne"}`
      : null,
    times.join(" · ") || null,
    formatNutrition(recipe),
    formatSource(recipe.source, recipe.source_page),
  ].filter(Boolean);
  const steps = splitSteps(recipe.notes);

  return (
    <div className="min-h-dvh bg-white text-neutral-900 print:min-h-0">
      <style>{"@page { margin: 15mm; }"}</style>
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link
            to={back}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-10 px-2 text-neutral-900",
            )}
          >
            <ArrowLeft /> Retour
          </Link>
          <Button className="h-10 px-3" onClick={() => window.print()}>
            <Printer /> Imprimer ou enregistrer en PDF
          </Button>
        </div>
      </header>

      <main>
        <article className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:p-0">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {recipe.title}
          </h1>
          {meta.length > 0 && (
            <p className="mt-2 text-sm text-neutral-600">{meta.join(" · ")}</p>
          )}
          {recipe.tags.length > 0 && (
            <p className="mt-1 text-sm text-neutral-600">
              {recipe.tags.join(", ")}
            </p>
          )}

          <div className="mt-6 grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
            <section aria-labelledby="print-ingredients">
              <h2
                id="print-ingredients"
                className="mb-2 border-b border-neutral-300 pb-1 text-lg font-semibold"
              >
                Ingrédients
              </h2>
              {ingredients.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  Aucun ingrédient renseigné.
                </p>
              ) : (
                groupBySection(ingredients).map((group, g) => (
                  <div
                    key={g}
                    className={cn("break-inside-avoid", g > 0 && "mt-3")}
                  >
                    {group.section && (
                      <h3 className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                        {group.section}
                      </h3>
                    )}
                    <ul className="space-y-1 text-sm">
                      {group.items.map((ingredient, i) => (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden>•</span>
                          <span>{formatIngredient(ingredient)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>

            <section aria-labelledby="print-steps">
              <h2
                id="print-steps"
                className="mb-2 border-b border-neutral-300 pb-1 text-lg font-semibold"
              >
                Préparation
              </h2>
              {steps.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  Aucune étape renseignée.
                </p>
              ) : (
                <ol className="space-y-3 text-sm leading-relaxed">
                  {steps.map((step, i) => (
                    <li key={i} className="flex break-inside-avoid gap-3">
                      <span className="w-5 shrink-0 font-semibold tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="break-words">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {recipe.url && (
            <p className="mt-8 border-t border-neutral-300 pt-2 text-xs break-all text-neutral-600">
              {recipe.url}
            </p>
          )}
        </article>
      </main>
    </div>
  );
}
