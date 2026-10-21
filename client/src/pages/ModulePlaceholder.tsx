import { MODULE_DEFS, type ModuleKey } from "../config/modules";

// Temporary placeholder for modules not yet built (Modules 2–8).
export function ModulePlaceholder({ moduleKey }: { moduleKey: ModuleKey }) {
  const def = MODULE_DEFS.find((m) => m.key === moduleKey);
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-pearl-900">
        <span aria-hidden>{def?.icon}</span>
        {def?.label}
      </h1>
      <div className="mt-6 rounded-xl border border-dashed border-pearl-300 bg-white/50 p-10 text-center text-pearl-500">
        The <strong>{def?.label}</strong> module is scaffolded and will be built in a
        later module. Server-side RBAC already protects its routes.
      </div>
    </div>
  );
}
