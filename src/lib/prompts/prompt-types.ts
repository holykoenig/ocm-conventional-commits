/**
 * @since 2020-03-25 09:12
 * @author vivaxy
 */
import * as vscode from 'vscode';
import * as configuration from '../configuration';
import createSimpleQuickPick from './quick-pick';

export enum PROMPT_TYPES {
  QUICK_PICK,
  INPUT_BOX,
  CONFIGURIABLE_QUICK_PICK,
}

type Item = {
  label: string;
  detail?: string;
  description?: string;
  alwaysShow?: boolean;
};

export type Prompt = { name: string; type: PROMPT_TYPES } & Options &
  Partial<QuickPickOptions> &
  Partial<InputBoxOptions> &
  Partial<ConfiguriableQuickPickOptions>;

type Options = {
  placeholder: string;
  format?: (input: string) => string;
  value: string;
  step: number;
  totalSteps: number;
};

type QuickPickOptions = {
  items: Item[];
  noneItem?: Item;
} & Options;

async function createQuickPick({
  placeholder,
  value,
  items = [],
  format = (i: string) => i,
  step,
  totalSteps,
  noneItem,
}: QuickPickOptions): Promise<string> {
  const pickerItems = items;

  if (noneItem) {
    pickerItems.push(noneItem);
  }

  const selectedItems = await createSimpleQuickPick<Item>({
    placeholder,
    value,
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
    items,
    step,
    totalSteps,
  });

  let selectedValue = selectedItems[0].label;
  if (noneItem && selectedValue === noneItem.label) {
    selectedValue = '';
  }
  return format(selectedValue);
}

type InputBoxOptions = {
  validate?: (value: string) => string | undefined;
} & Options;

function createInputBox({
  placeholder,
  format = (i) => i,
  value,
  step,
  totalSteps,
  validate = () => undefined,
}: InputBoxOptions): Promise<string> {
  return new Promise(function (resolve, reject) {
    const input = vscode.window.createInputBox();
    input.step = step;
    input.totalSteps = totalSteps;
    input.ignoreFocusOut = true;
    input.placeholder = placeholder;
    input.value = value;
    input.onDidChangeValue(function () {
      try {
        input.validationMessage = validate(input.value);
      } catch (e) {
        reject(e);
      }
    });
    input.onDidAccept(function () {
      try {
        input.validationMessage = validate(input.value);
        if (input.validationMessage) {
          return;
        }
        const result = format(input.value);
        input.dispose();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
    input.prompt = placeholder;
    input.show();
  });
}

type ConfiguriableQuickPickOptions = {
  configurationKey: keyof configuration.Configuration;
  newItem: Item;
  newItemPlaceholder: string;
  moreItems?: Item[];
  addNoneOption: boolean;
  validate?: (value: string) => string | undefined;
} & QuickPickOptions;

async function createConfiguriableQuickPick({
  placeholder,
  format = (i) => i,
  step,
  totalSteps,
  configurationKey,
  newItem,
  noneItem,
  moreItems = [],
  newItemPlaceholder,
  validate = () => undefined,
}: ConfiguriableQuickPickOptions): Promise<string> {
  const confKey = configuration.get<string[]>(configurationKey);
  let items: Item[] = [];
  let currentValues: string[] = [];
  if (confKey) {
    currentValues = configuration.get<string[]>(configurationKey);
    items = currentValues.map(function (value) {
      return {
        label: value,
        description: '',
      };
    });
  }
  items.push(newItem);

  moreItems.forEach(function (item) {
    items.push(item);
  });

  // @ts-ignore
  let selectedValue = await createQuickPick({
    placeholder,
    items,
    step,
    totalSteps,
    noneItem,
  });
  if (selectedValue === newItem.label) {
    // @ts-ignore
    selectedValue = await createInputBox({
      placeholder: newItemPlaceholder,
      step,
      totalSteps,
      validate,
    });
    if (selectedValue) {
      configuration.update(configurationKey, [...currentValues, selectedValue]);
    }
  }
  return format(selectedValue);
}

export default {
  [PROMPT_TYPES.QUICK_PICK]: createQuickPick,
  [PROMPT_TYPES.INPUT_BOX]: createInputBox,
  [PROMPT_TYPES.CONFIGURIABLE_QUICK_PICK]: createConfiguriableQuickPick,
};
