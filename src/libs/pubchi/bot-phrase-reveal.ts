export class BotPhraseRevealController {
  #phrase: string | undefined;
  #revealed = false;

  set(phrase: string): void {
    this.clear();
    this.#phrase = phrase;
  }

  reveal(): boolean {
    if (!this.#phrase) return false;
    this.#revealed = true;
    return true;
  }

  words(): string[] {
    return this.#revealed && this.#phrase ? this.#phrase.split(' ') : [];
  }

  phraseForConfirmation(): string | undefined {
    return this.#revealed ? this.#phrase : undefined;
  }

  clear(): void {
    this.#phrase = undefined;
    this.#revealed = false;
  }
}
