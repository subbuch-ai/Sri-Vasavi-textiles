import React from "react";

/** Strip leading zeros when typing into uncontrolled/RHF numeric inputs. */
export const stripLeadingZeroProps = {
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.value === "0") {
      e.currentTarget.select();
    }
  },
  onInput: (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (/^0\d/.test(el.value)) {
      el.value = el.value.replace(/^0+(?=\d)/, "");
    }
  },
};

