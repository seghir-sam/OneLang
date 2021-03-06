import { Workspace, UnresolvedImport } from "../Ast/Types";

/**
 * Fills SourceFile's `availableSymbols` property with all the imported symbols.
 * Also replaces UnresolvedImports in `Import.imports` to an IImportable (either Interface or Class or GlobalFunction)
 */
export class ResolveImports {
    static processWorkspace(ws: Workspace): void {
        for (const pkg of Object.values(ws.packages))
            for (const file of Object.values(pkg.files)) {
                for (const imp of file.imports) {
                    const impPkg = ws.getPackage(imp.exportScope.packageName);
                    const scope = impPkg.getExportedScope(imp.exportScope.scopeName);
                    imp.imports = imp.importAll ? scope.getAllExports() : 
                        imp.imports.map(x => x instanceof UnresolvedImport ? scope.getExport(x.name) : x);
                    file.addAvailableSymbols(imp.imports);
                }
            }
    }
}