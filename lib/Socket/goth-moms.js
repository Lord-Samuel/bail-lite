// Requires: npm i protobufjs
import protobuf from "protobufjs";
import fs from "fs";

const ROOT_TYPE = "proto.Message";

function isEnum(t) {
  return t && t.constructor && t.constructor.name === "Enum";
}
function isType(t) {
  return t && t.constructor && t.constructor.name === "Type";
}
function enumFullName(e) {
  return e.fullName || e.name;
}

function collectReachableTypes(root, entryFullName) {
  const entry = root.lookupType(entryFullName);
  const queue = [entry];
  const seenTypes = new Set([entryFullName]);
  const reachableMessages = new Map([[entryFullName, entry]]);
  const reachableEnums = new Map();

  while (queue.length) {
    const msg = queue.shift();

    for (const f of msg.fieldsArray) {
      const rt = f.resolvedType;
      if (!rt) continue;

      if (isType(rt)) {
        const full = rt.fullName || rt.name;
        if (!seenTypes.has(full)) {
          seenTypes.add(full);
          reachableMessages.set(full, rt);
          queue.push(rt);
        }
      } else if (isEnum(rt)) {
        const efull = enumFullName(rt);
        if (!reachableEnums.has(efull)) reachableEnums.set(efull, rt);
      }
    }
  }
  return { reachableMessages, reachableEnums };
}

function collectEnumFieldPathsForMessage(msgType) {
  const paths = [];
  const enumsByPath = new Map();

  const dfs = (type, prefix) => {
    for (const f of type.fieldsArray) {
      const name = f.name;
      const rt = f.resolvedType;
      const seg = prefix + name + (f.repeated ? "[]" : "");

      if (!rt) continue;

      if (isEnum(rt)) {
        const efull = enumFullName(rt);
        paths.push(seg);
        enumsByPath.set(seg, efull);
      } else if (isType(rt)) {
        dfs(rt, seg + ".");
      }
    }
  };

  dfs(msgType, "");
  return { paths, enumsByPath };
}

function buildMessageEnumIndex(root, entryFullName) {
  const { reachableMessages } = collectReachableTypes(root, entryFullName);

  const out = {};
  for (const [fullName, msgType] of reachableMessages.entries()) {
    const { paths, enumsByPath } = collectEnumFieldPathsForMessage(msgType);

    const neededEnums = new Map();
    for (const p of paths) {
      const efull = enumsByPath.get(p);
      const e = msgType.root.lookup(efull);
      if (e && isEnum(e)) neededEnums.set(efull, e);
    }

    const enumsObj = {};
    for (const [efull, e] of neededEnums.entries()) {
      const vals = {};
      for (const [k, v] of Object.entries(e.values)) vals[k] = v;
      enumsObj[efull] = vals;
    }

    const fieldsObj = {};
    for (const p of paths) fieldsObj[p] = enumsByPath.get(p);

    out[fullName] = {
      fieldEnums: fieldsObj,
      enums: enumsObj,
    };
  }
  return out;
}

export async function generateMessageEnums(protoPath, outPath = "message_enums.js") {
  const root = await protobuf.load(protoPath);
  const index = buildMessageEnumIndex(root, ROOT_TYPE);

  const file = `// Generated from ${protoPath}
export const MessageEnums = ${JSON.stringify(index, null, 2)};
`;
  fs.writeFileSync(outPath, file);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const proto = process.argv[2] || "WAProto.proto";
  const out = process.argv[3] || "message_enums.js";
  generateMessageEnums(proto, out);
}