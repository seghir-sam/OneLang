declare class YamlValue {
    obj(key: string): YamlValue;
    dbl(key: string): number;
    str(key: string): string;
    arr(key: string): YamlValue[];
    strArr(key: string): string[];
}

declare class OneYaml {
    static load(content: string): YamlValue;
}