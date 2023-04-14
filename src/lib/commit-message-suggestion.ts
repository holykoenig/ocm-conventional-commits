import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import git from 'simple-git';

import { Configuration, OpenAIApi } from 'openai';

function isRateLimitError(error: AxiosError) {
  return error.response?.status === 429;
}

async function hasUnstagedChanges() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  const gitInstance = git(workspaceFolders[0].uri.fsPath);
  const statusSummary = await gitInstance.status();

  return statusSummary.files.some(
    (file) => file.index !== 'A' && file.index !== 'M',
  );
}

export let suggestions: any;
export async function getCommitMessages() {
  const apiKey = await getOpenAIKey();

  if (!apiKey) {
    vscode.window.showErrorMessage(
      'Please provide your OpenAI API key to use this extension.',
    );
    return;
  }

  if (await hasUnstagedChanges()) {
    const terminal =
      vscode.window.activeTerminal || vscode.window.createTerminal();
    terminal.show();
    terminal.sendText('git status');
    vscode.window.showInformationMessage(
      'You need to stage your changes with "git add ." before using this extension.',
    );
    return;
  }

  // Get the staged changes
  const stagedChanges = await getStagedChanges();

  // Check if there are no staged changes
  if (!stagedChanges || stagedChanges.trim() === '') {
    vscode.window.showInformationMessage('There are no changes to commit.');
    return;
  }

  if (!suggestions) {
    function convertArrayToTypeItems(array: string[]): { label: string }[] {
      const typeItems = array.map((item) => {
        return { label: item };
      });
      return typeItems;
    }

    suggestions = await generateCommitSuggestions(apiKey, stagedChanges, 5);
    suggestions = convertArrayToTypeItems(suggestions);
    console.log(suggestions);
  }

  if (suggestions.length === 0) {
    return;
  }
}

export async function getOpenAIKey(
  forceNewKey = false,
): Promise<string | undefined> {
  const configuration = vscode.workspace.getConfiguration(
    'conventionalCommits',
  );
  let apiKey = forceNewKey ? undefined : configuration.get<string>('openAIKey');

  if (!apiKey) {
    apiKey = await vscode.window.showInputBox({
      prompt: 'API OpenAI secret key',
      ignoreFocusOut: true,
      password: true,
    });

    if (apiKey) {
      configuration.update(
        'openAIKey',
        apiKey,
        vscode.ConfigurationTarget.Global,
      );
    }
  }

  return apiKey;
}

async function getStagedChanges(): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return '';
  }
  // try this extension
  const gitInstance = git(workspaceFolders[0].uri.fsPath);
  const diffSummary = await gitInstance.diff(['--staged']);

  return diffSummary;
}

async function generateCommitSuggestions(
  apiKey: string,
  prompt: string,
  numSuggestions: number,
): Promise<string[] | undefined> {
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);

  try {
    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: `Given the Git commit history: ${prompt}\n\nSuggest a commit message." :\n`,
      temperature: 0.5,
      max_tokens: 50,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      n: numSuggestions,
    });

    const uniqueSuggestions = Array.from(
      new Set(
        response.data.choices.map((choice) => (choice.text ?? '').trim()),
      ),
    );
    const suggestions = uniqueSuggestions.map((suggestion) => `${suggestion}`);

    return suggestions;
  } catch (error) {
    if (axios.isAxiosError(error) && isRateLimitError(error)) {
      vscode.window.showErrorMessage(
        'Ihr API-Schlüssel ist abgelaufen. Bitte geben Sie einen anderen Schlüssel ein.',
      );
      const newApiKey = await getOpenAIKey(true);
      if (newApiKey) {
        return generateCommitSuggestions(newApiKey, prompt, numSuggestions);
      }
    } else {
      throw error;
    }
  }

  return undefined;
}
