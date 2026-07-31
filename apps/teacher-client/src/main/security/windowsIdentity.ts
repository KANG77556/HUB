import { execFile } from 'node:child_process';

export type CommandOptions = {
  windowsHide: boolean;
};

export type CommandResult = {
  stdout: string;
};

export type CommandRunner = (
  executable: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<CommandResult>;

export const nodeCommandRunner: CommandRunner = (
  executable,
  args,
  options,
) =>
  new Promise<CommandResult>((resolve, reject) => {
    execFile(
      executable,
      [...args],
      { encoding: 'utf8', windowsHide: options.windowsHide },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve({ stdout });
      },
    );
  });

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
      continue;
    }
    field += character ?? '';
  }

  if (quoted) {
    throw new Error('invalid CSV output');
  }
  fields.push(field);
  return fields;
}

export async function getWindowsSid(
  runner: CommandRunner = nodeCommandRunner,
): Promise<string> {
  try {
    const { stdout } = await runner(
      'whoami.exe',
      ['/user', '/fo', 'csv', '/nh'],
      { windowsHide: true },
    );
    const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim();
    if (firstLine === undefined || firstLine.length === 0) {
      throw new Error('missing whoami output');
    }
    const sid = parseCsvLine(firstLine)[1]?.trim();
    if (sid === undefined || !/^S-1-\d+(?:-\d+)+$/.test(sid)) {
      throw new Error('invalid SID');
    }
    return sid;
  } catch (error: unknown) {
    throw new Error('WINDOWS_IDENTITY_UNAVAILABLE', { cause: error });
  }
}
