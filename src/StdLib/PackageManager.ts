import { LangFileSchema } from "../Generator/LangFileSchema";
import { AstHelper } from "../One/AstHelper";
import { extend } from "../Utils/Helpers";
import * as path from 'path';

const fs = require("fs");
const glob = require("glob");
global["YAML"] = require('yamljs'); 
declare var YAML;

export class PackageId {
    type: "Interface"|"Implementation";
    name: string;
    version: string;
}

export interface PackageContent {
    id: PackageId;
    files: { [path: string]: string };
    fromCache: boolean;
}

export interface PackageBundle {
    packages: PackageContent[];
}

export interface PackageSource {
    getPackageBundle(ids: PackageId[], cachedOnly: boolean): Promise<PackageBundle>;
    getAllCached(): Promise<PackageBundle>;
}

export interface PackageNativeImpl {
    packageName: string;
    fileName: string;
    code: string;
}

export interface InterfaceYaml {
    "file-version": number;
    vendor: string;
    name: string;
    version: number;
    "definition-file": string;
}

export class InterfacePackage {
    interfaceYaml: InterfaceYaml;
    definition: string;

    constructor(public content: PackageContent) {
        this.interfaceYaml = YAML.parse(content.files["interface.yaml"]);
        this.definition = content.files[this.interfaceYaml["definition-file"]];
    }
}

export class ImplPkgImplementation {
    interface: { name: string; minver: number; maxver: number };
    language: string;
    "native-includes": string[];
    "native-includes-dir": string;
    implementation: LangFileSchema.LangFile;
}

export class ImplPackageYaml {
    "file-version": number;
    vendor: string;
    name: string;
    description: string;
    version: number;
    includes: string[];
    implements: ImplPkgImplementation[];
}

export class ImplementationPackage {
    implementationYaml: ImplPackageYaml;
    implementations: ImplPkgImplementation[] = [];

    constructor(public content: PackageContent) {
        this.implementationYaml = YAML.parse(content.files["package.yaml"]);
        this.implementations = [...this.implementationYaml.implements||[]];
        for (const include of this.implementationYaml.includes||[]) {
            const included = <ImplPackageYaml> YAML.parse(content.files[include]);
            this.implementations.push(...included.implements);
        }
    }
}

export class PackagesFolderSource implements PackageSource {
    getPackageBundle(ids: PackageId[], cachedOnly: boolean): Promise<PackageBundle> {
        throw new Error("Method not implemented.");
    }

    async getAllCached(): Promise<PackageBundle> {
        const packages: { [id: string]: PackageContent } = {};
        const baseDir = `${__dirname}/../../packages/`;
        const allFiles = glob.sync(`${baseDir}**/*`, { nodir: true });
        for (const fn of allFiles) {
            const [type, pkgDir, ...pathParts] = path.relative(baseDir, fn).split("/"); // [0]=packages, [1]=implementations/interfaces, [2]=package-name, [3:]=path
            let pkg = packages[`${type}/${pkgDir}`];
            if (!pkg) {
                const pkgDirParts: string[] = pkgDir.split("-");
                const version = pkgDirParts.pop().replace(/^v/, "");
                pkg = packages[`${type}/${pkgDir}`] = <PackageContent> { 
                    id: <PackageId> {
                        name: pkgDirParts.join("-"),
                        type: type === "implementations" ? "Implementation" : "Interface",
                        version
                    },
                    fromCache: true,
                    files: {}
                };
            }
            pkg.files[pathParts.join("/")] = fs.readFileSync(fn, "utf-8");
        }
        return <PackageBundle> { packages: Object.values(packages) };
    }
}

export class PackageManager {
    intefacesPkgs: InterfacePackage[] = [];
    implementationPkgs: ImplementationPackage[] = [];

    constructor(public source: PackageSource) { }

    async loadAllCached() {
        const allPackages = await this.source.getAllCached();

        for (const content of allPackages.packages.filter(x => x.id.type === "Interface"))
            this.intefacesPkgs.push(new InterfacePackage(content));

        for (const content of allPackages.packages.filter(x => x.id.type === "Implementation"))
            this.implementationPkgs.push(new ImplementationPackage(content));
    }

    getLangImpls(langName: string): ImplPkgImplementation[] {
        const allImpls = this.implementationPkgs.reduce((x,y) => [...x, ...y.implementations], []);
        return allImpls.filter(x => x.language === langName);
    }

    loadImplsIntoLangFile(lang: LangFileSchema.LangFile) {
        for (const impl of this.getLangImpls(lang.name))
            extend(lang, impl.implementation||{});
    }

    getInterfaceDefinitions() {
        return this.intefacesPkgs.map(x => x.definition).join("\n");
    }

    getLangNativeImpls(langName: string): PackageNativeImpl[] {
        let result = [];
        for (const pkg of this.implementationPkgs) {
            for (const impl of pkg.implementations.filter(x => x.language === langName)) {
                const fileNames = [];
                for (const fileName of impl["native-includes"] || [])
                    fileNames.push(fileName);

                let incDir = impl["native-include-dir"];
                if (incDir) {
                    if (!incDir.endsWith("/")) incDir += "/";
                    fileNames.push(...Object.keys(pkg.content.files)
                        .filter(x => x.startsWith(`native/${incDir}`)).map(x => x.substr("native/".length)));
                }

                for (const fileName of fileNames) {
                    const code = pkg.content.files[`native/${fileName}`];
                    if (!code) throw new Error(`File '${fileName}' was not found for package '${pkg.implementationYaml.name}'`);
                    result.push({ packageName: pkg.implementationYaml.name, fileName, code });
                }

            }
        }
        return result;
    }
}