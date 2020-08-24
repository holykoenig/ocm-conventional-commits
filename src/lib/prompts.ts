/**
 * @since 2020-03-25 09:09
 * @author vivaxy
 */
const conventionalCommitsTypes = require('conventional-commit-types');

import * as configuration from './configuration';
import promptTypes, { PROMPT_TYPES, Prompt } from './prompts/prompt-types';
import * as names from '../configs/names';
import CommitMessage from './commit-message';
import commitlint from './commitlint';
import * as output from './output';

export default async function prompts(
  {
    lineBreak,
  }: {
    lineBreak: string;
  },
  repo: any,
): Promise<CommitMessage> {
  const getBranchName = () => {
    const branch = repo.state.HEAD.name;
    if (branch.includes('TUB')) {
      return branch.split('/')[1];
    }
    return 'NO-TICKET';
  };

  function lineBreakFormatter(input: string): string {
    if (lineBreak) {
      return input.replace(
        new RegExp(lineBreak.replace(/\\/g, '\\\\'), 'g'),
        '\n',
      );
    }
    return input;
  }

  function getTypeItems() {
    const typeEnum = commitlint.getTypeEnum();
    if (typeEnum.length === 0) {
      return Object.keys(conventionalCommitsTypes.types).map(function (type) {
        const { title } = conventionalCommitsTypes.types[type];
        return {
          label: type,
          description: title,
        };
      });
    }
    return typeEnum.map(function (type) {
      if (type in conventionalCommitsTypes.types) {
        const { title } = conventionalCommitsTypes.types[type];
        return {
          label: type,
          description: title,
        };
      }
      return {
        label: type,
        description: names.DESCRIPTION_OF_AN_ITEM_FROM_COMMITLINT_CONFIG,
      };
    });
  }

  function getScopePrompt() {
    const name = 'scope';
    const placeholder = 'Select the scope of this change.';
    const scopeEnum = commitlint.getScopeEnum();
    if (scopeEnum.length) {
      return {
        type: PROMPT_TYPES.QUICK_PICK,
        name,
        placeholder,
        items: scopeEnum.map(function (scope) {
          return {
            label: scope,
            description: names.DESCRIPTION_OF_AN_ITEM_FROM_COMMITLINT_CONFIG,
            detail: names.DETAIL_OF_AN_ITEM_FROM_COMMITLINT_CONFIG,
          };
        }),
        noneItem: {
          label: 'None',
          description: '',
          detail: 'No scope.',
          alwaysShow: true,
        },
      };
    }

    return {
      type: PROMPT_TYPES.CONFIGURIABLE_QUICK_PICK,
      name,
      placeholder,
      configurationKey: names.SCOPES as keyof configuration.Configuration,
      newItem: {
        label: 'New scope',
        description: '',
        detail:
          'Add a workspace scope. (You can manage scopes in workspace `settings.json`.)',
        alwaysShow: true,
      },
      noneItem: {
        label: 'None',
        description: '',
        detail: 'No scope.',
        alwaysShow: true,
      },
      newItemPlaceholder: 'Create a new scope.',
      validate(input: string) {
        return commitlint.lintScope(input);
      },
    };
  }

  const questions: Prompt[] = [
    {
      type: PROMPT_TYPES.QUICK_PICK,
      name: 'type',
      placeholder: "Select the type of change that you're committing.",
      items: getTypeItems(),
      validate(input: string) {
        return commitlint.lintType(input);
      },
    },
    getScopePrompt(),
    {
      type: PROMPT_TYPES.INPUT_BOX,
      name: 'subject',
      placeholder: 'Write a short, imperative tense description of the change.',
      validate(input: string) {
        return commitlint.lintSubject(input);
      },
      format: lineBreakFormatter,
    },
    {
      type: PROMPT_TYPES.INPUT_BOX,
      name: 'footer',
      value: getBranchName(),
      validate(input: string) {
        return commitlint.lintFooter(input);
      },
      format: lineBreakFormatter,
    },
  ].map(function (question, index, array) {
    return {
      ...question,
      step: index + 1,
      totalSteps: array.length,
    };
  });

  const commitMessage: CommitMessage = {
    type: '',
    scope: '',
    subject: '',
    footer: '',
  };

  for (const question of questions) {
    commitMessage[question.name as keyof CommitMessage] = await promptTypes[
      question.type
    ](
      // @ts-ignore
      question,
    );
  }
  return commitMessage;
}
