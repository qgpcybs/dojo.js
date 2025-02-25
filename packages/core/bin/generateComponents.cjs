#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Check for the required arguments
if (process.argv.length !== 6) {
    console.log(
        "Usage: <MANIFEST_PATH> <OUTPUT_PATH> <RPC_URL> <WORLD_ADDRESS>"
    );
    process.exit(1);
}

// Extract paths from command-line arguments
const manifestPath = path.resolve(process.argv[2]);
const jsFilePath = path.resolve(process.argv[3]);
const rpcUrl = process.argv[4];
const worldAddress = process.argv[5];

// check that `sozo` command exist
try {
    execSync(`command -v sozo 2>/dev/null`);
} catch (e) {
    console.error(
        "unable to find `sozo` command. Please install using `dojoup`."
    );
    process.exit(0);
}

// Extract recs package version
const { dependencies } = require(path.resolve("./package.json"));
const recsVersion = dependencies?.["@dojoengine/recs"] ?? "";
const isRecsVersion2 = /^[\^\~]?2./g.exec(recsVersion) != null;
console.log(
    `...generating for @dojoengine/recs version ${
        isRecsVersion2
            ? "2 (bigint support, Entity as string)"
            : "1 (no bigint, EntityIndex as number)"
    }`
);
console.log("---------------------------");

const cairoToRecsType = {
    bool: "RecsType.Boolean",
    u8: "RecsType.Number",
    u16: "RecsType.Number",
    u32: "RecsType.Number",
    u64: "RecsType.Number",
    usize: "RecsType.Number",
    u128: isRecsVersion2 ? "RecsType.BigInt" : "RecsType.Number",
    u256: isRecsVersion2 ? "RecsType.BigInt" : "RecsType.NumberArray",
    felt252: isRecsVersion2 ? "RecsType.BigInt" : "RecsType.Number",
    ContractAddress: isRecsVersion2 ? "RecsType.BigInt" : "RecsType.Number",
};

const manifestStr = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestStr);

let fileContent = `/* Autogenerated file. Do not edit manually. */\n\n`;
fileContent += `import { defineComponent, Type as RecsType, World } from "@dojoengine/recs";\n\n`;
fileContent += `export function defineContractComponents(world: World) {\n  return {\n`;

manifest.models.forEach((model) => {
    const customTypes = [];
    const modelName = model.name;

    try {
        const output = execSync(
            `sozo model schema ${modelName} --rpc-url ${rpcUrl} --json --world ${worldAddress}`
        ).toString();

        const schema = JSON.parse(output);
        const recsTypeObject = parseModelSchemaToRecs(schema, customTypes);

        fileContent += `	  ${modelName}: (() => {\n`;
        fileContent += `	    return defineComponent(\n`;
        fileContent += `	      world,\n`;
        fileContent += `	      ${recsTypeObject},\n`;
        fileContent += `	      {\n`;
        fileContent += `	        metadata: {\n`;
        fileContent += `	          name: "${modelName}",\n`;
        fileContent += `	          types: ${JSON.stringify(customTypes)},\n`;
        fileContent += `	        },\n`;
        fileContent += `	      }\n`;
        fileContent += `	    );\n`;
        fileContent += `	  })(),\n`;
    } catch (e) {
        console.error(
            `error when fetching schema for model '${modelName}' from ${rpcUrl}: ${e}`
        );
        process.exit(0);
    }
});

fileContent += `  };\n}\n`;

fs.writeFile(jsFilePath, fileContent, (err) => {
    if (err) {
        console.error("error writing file:", err);
    } else {
        console.log("file generated successfully");
    }
});

function parseModelSchemaToRecs(schema, customTypes = []) {
    // top level type must be struct
    if (schema.type !== "struct") {
        throw new Error("unsupported root schema type");
    }
    return parseSchemaStruct(schema.content, customTypes);
}

function parseModelSchemaToRecsImpl(schema, customTypes) {
    const type = schema.type;
    const content = schema.content;

    if (type === "primitive") {
        return parseSchemaPrimitive(content);
    } else if (type === "struct") {
        customTypes.push(content.name);
        return parseSchemaStruct(content, customTypes);
    } else if (type === "enum") {
        customTypes.push(content.name);
        return parseSchemaEnum(content);
    } else if (type === "tuple") {
        return parseSchemaTuple(content, customTypes);
    }
}

function parseSchemaPrimitive(content) {
    const scalarType = content["scalar_type"].toLowerCase();
    return cairoToRecsType[scalarType] ?? "RecsType.String"; // Default type set to String
}

function parseSchemaStruct(content, customTypes) {
    return `{ ${content.children
        .map((member) => {
            return `${member.name}: ${parseModelSchemaToRecsImpl(
                member.member_type,
                customTypes
            )}`;
        })
        .join(", ")} }`;
}

function parseSchemaEnum(_schema) {
    return "RecsType.Number";
}

function parseSchemaTuple(content, customTypes) {
    return `[ ${content
        .map((schema) => parseModelSchemaToRecsImpl(schema, customTypes))
        .join(", ")} ]`;
}
