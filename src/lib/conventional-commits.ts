/**
 * @since 2020-03-25 09:08
 * @author vivaxy
 */
import * as path from 'path';
import * as vscode from 'vscode';
import * as VSCodeGit from '../vendors/git';
import prompts from './prompts';
import * as configuration from './configuration';
import * as names from '../configs/names';
import * as output from './output';
import commitlint from './commitlint';
import createSimpleQuickPick from './prompts/quick-pick';
import CommitMessage from './commit-message';

function getGitAPI(): VSCodeGit.API | void {
  const vscodeGit = vscode.extensions.getExtension<VSCodeGit.GitExtension>(
    'vscode.git',
  );
  if (vscodeGit) {
    return vscodeGit.exports.getAPI(1);
  }
}

function formatCommitMessage(commitMessage: CommitMessage) {
  let message = '';
  message += commitMessage.type.trim();
  const scope = commitMessage.scope.trim();
  if (scope) {
    message += `(${scope})`;
  }
  message += ': ';
  const subject = commitMessage.subject.trim();
  if (subject) {
    message += subject;
  }
  const footer = commitMessage.footer.trim();
  if (footer) {
    message += `\n\n${footer}`;
  }
  return message;
}

function outputExtensionVersion(name: string, key: string) {
  output.appendLine(
    `${name} version: ${
      vscode.extensions.getExtension(key)?.packageJSON.version
    }`,
  );
}

function outputConfiguration(key: keyof configuration.Configuration) {
  output.appendLine(`${key}: ${configuration.get(key)}`);
}

function outputRelatedExtensionConfigutation(key: string) {
  output.appendLine(`${key}: ${configuration.getConfiguration().get(key)}`);
}

type Arg = {
  _rootUri?: vscode.Uri;
};

function hasChanges(repo: VSCodeGit.Repository) {
  return (
    repo.state.workingTreeChanges.length ||
    repo.state.mergeChanges.length ||
    repo.state.indexChanges.length
  );
}

async function getRepository({
  git,
  arg,
  workspaceFolders,
}: {
  git: VSCodeGit.API;
  arg?: Arg;
  workspaceFolders?: readonly vscode.WorkspaceFolder[];
}) {
  output.appendLine(`arg: ${arg?._rootUri?.fsPath}`);
  output.appendLine(
    `git.repositories: ${git.repositories
      .map(function (repo) {
        return repo.rootUri.fsPath;
      })
      .join(', ')}`,
  );
  output.appendLine(
    `workspacceFolders: ${workspaceFolders
      ?.map(function (folder) {
        return folder.uri.fsPath;
      })
      .join(', ')}`,
  );

  if (arg && arg._rootUri?.fsPath) {
    const repo = git.repositories.find(function (r) {
      return r.rootUri.fsPath === arg._rootUri.fsPath;
    });
    if (repo) {
      return repo;
    }
    throw new Error('Repository not found in path: ' + arg._rootUri.fsPath);
  }

  if (git.repositories.length === 0) {
    throw new Error('Please open a repository.');
  }

  if (git.repositories.length === 1) {
    return git.repositories[0];
  }

  const items = git.repositories.map(function (repo, index) {
    const folder = workspaceFolders?.find(function (f) {
      return f.uri.fsPath === repo.rootUri.fsPath;
    });
    return {
      index,
      label: folder?.name || path.basename(repo.rootUri.fsPath),
      description:
        `${
          repo.state.HEAD?.name || repo.state.HEAD?.commit?.slice(0, 8) || ''
        }${hasChanges(repo) ? '*' : ''}` || '',
    };
  });

  const [{ index }] = await createSimpleQuickPick({
    placeholder: 'Choose a repository',
    items,
  });

  return git.repositories[index];
}

async function updateConventionalCommits(commitMessage: any) {
  try {
    // 2. check git
    const git = getGitAPI();
    if (!git) {
      throw new Error('vscode.git is not enabled.');
    }

    // 3. get repository
    const repository = await getRepository({
      git,
      workspaceFolders: vscode.workspace.workspaceFolders,
    });

    // 4. get commitlint rules
    const commitlintRuleConfigs = await commitlint.loadRuleConfigs(
      repository.rootUri.fsPath,
    );
    output.appendLine(
      `commitlintRuleConfigs: ${JSON.stringify(
        commitlintRuleConfigs,
        null,
        2,
      )}`,
    );

    output.appendLine(
      `commitMessage: ${JSON.stringify(commitMessage, null, 2)}`,
    );
    const message = formatCommitMessage(commitMessage);
    output.appendLine(`message: ${message}`);

    // 6. switch to scm and put message into message box
    repository.inputBox.value = message;
    output.appendLine(`inputBox.value: ${repository.inputBox.value}`);
  } catch (e) {
    output.appendLine(`Finished with an error: ${e.stack}`);
    vscode.window.showErrorMessage(
      `${names.Conventional_Commits}: ${e.message}`,
    );
  }
}

function createConventionalCommits() {
  return async function conventionalCommits(arg?: Arg) {
    try {
      output.appendLine('Started');

      // 1. output basic information
      output.appendLine(`VSCode version: ${vscode.version}`);

      outputExtensionVersion(
        'VSCode Conventional Commits',
        'vivaxy.vscode-conventional-commits',
      );
      outputExtensionVersion('Git', 'vscode.git');

      outputConfiguration('autoCommit');
      outputConfiguration('scopes');
      outputConfiguration('lineBreak');

      outputRelatedExtensionConfigutation('git.enableSmartCommit');
      outputRelatedExtensionConfigutation('git.smartCommitChanges');
      outputRelatedExtensionConfigutation('git.postCommitCommand');

      // 2. check git
      const git = getGitAPI();
      if (!git) {
        throw new Error('vscode.git is not enabled.');
      }

      // 3. get repository
      const repository = await getRepository({
        arg,
        git,
        workspaceFolders: vscode.workspace.workspaceFolders,
      });

      // 4. get commitlint rules
      const commitlintRuleConfigs = await commitlint.loadRuleConfigs(
        repository.rootUri.fsPath,
      );
      output.appendLine(
        `commitlintRuleConfigs: ${JSON.stringify(
          commitlintRuleConfigs,
          null,
          2,
        )}`,
      );

      // 5. get message
      const commitMessage = await prompts(
        {
          lineBreak: configuration.get<string>('lineBreak'),
        },
        repository,
      );
      output.appendLine(
        `commitMessage: ${JSON.stringify(commitMessage, null, 2)}`,
      );
      const message = formatCommitMessage(commitMessage);
      output.appendLine(`message: ${message}`);

      // 6. switch to scm and put message into message box
      vscode.commands.executeCommand('workbench.view.scm');
      repository.inputBox.value = message;
      output.appendLine(`inputBox.value: ${repository.inputBox.value}`);

      // 7. auto commit
      const autoCommit = configuration.get<boolean>('autoCommit');
      if (autoCommit) {
        await vscode.commands.executeCommand('git.commit', repository);
      }
      output.appendLine('Finished successfully.');
    } catch (e) {
      output.appendLine(`Finished with an error: ${e.stack}`);
      vscode.window.showErrorMessage(
        `${names.Conventional_Commits}: ${e.message}`,
      );
    }
  };
}

export { createConventionalCommits, updateConventionalCommits };
