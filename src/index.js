import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });

const fingerPrintMap = new Map();
let spaceToBeCleaned = 0;
let totalDuplatedFiles = 0;
const mbSize = 1000000;

let toDelete = [];

function createFingerPrint(fileName) {
  const fileContent = readFileSync(fileName);
  const hash = createHash("md5");
  hash.update(fileContent);
  return hash.digest("hex");
}

async function traverseDirectory(directoryName, visitor = () => {}) {
  const fileStats = await fs.stat(directoryName);
  if (!fileStats.isDirectory()) {
    console.log("can not traverse, not a directory");
    return;
  }

  const promises = [];
  const files = await fs.readdir(directoryName, { withFileTypes: true });
  files.forEach(async (file) => {
    if (file.isDirectory()) {
      promises.push(
        traverseDirectory(path.join(directoryName, file.name), visitor)
      );
    } else {
      visitor(path.join(directoryName, file.name));
    }
  });

  return Promise.all(promises);
}

async function mapper(fileName) {
  const fingerPrint = createFingerPrint(fileName);

  if (fingerPrintMap.has(fingerPrint)) {
    fingerPrintMap.get(fingerPrint).files.push(fileName);
  } else {
    const fileSize = (await fs.stat(fileName)).size;
    fingerPrintMap.set(fingerPrint, { fileSize, files: [fileName] });
  }
}

function printDuplicates() {
  for (const [key, { fileSize, files }] of fingerPrintMap.entries()) {
    if (files.length > 1) {
      totalDuplatedFiles += 1;
      spaceToBeCleaned += (files.length - 1) * fileSize;
      const deletables = excludeLongest(files);
      toDelete = [...toDelete, ...deletables];
    }
  }

  console.log(
    "aproximate space to be saved",
    spaceToBeCleaned / mbSize,
    totalDuplatedFiles,
    toDelete
  );
}

function excludeLongest(strs) {
  let index = 0;
  let maxLength = 0;
  strs.forEach((str, i) => {
    if (str.length > maxLength) {
      maxLength = str.length;
      index = i;
    }
  });

  const copy = strs.slice();
  copy.splice(index, 1);
  return copy;
}

async function deleteDuplicates() {
  const tempDir = path.join(os.homedir(), "deduplicate-files");

  let res = [];
  try {
    await fs.access(tempDir, fs.constants.F_OK);
  } catch (error) {
    await fs.mkdir(tempDir);
  } finally {
    res = toDelete.map((file, index) => {
      fs.rename(file, path.join(tempDir, `${index}_${path.basename(file)}`));
    });
  }

  return Promise.all(res);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("please provide a valid directory name");
    return;
  }

  const directory = path.resolve(args[0]);
  await traverseDirectory(directory, mapper);

  printDuplicates();

  rl.setPrompt("Enter 'Y' to remove duplicate files\n");
  rl.prompt();
  rl.on("line", async (response) => {
    if (response && response.toLocaleLowerCase() === "y") {
      rl.close();
      await deleteDuplicates();
    } else {
      console.log("program aborted");
      rl.close();
    }
  });
}

main();
