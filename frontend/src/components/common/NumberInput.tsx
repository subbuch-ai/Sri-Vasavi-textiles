import React, { useEffect, useState } from "react";

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number;
  onValueChange: (val: number) => void;
  emptyFallback?: number;
}

/**
 * Controlled numeric input that keeps typing natural:
 * removes leading zero when typing digits, lets the user backspace freely to empty,
 * and falls back cleanly on blur.
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onValueChange,
  emptyFallback = 0,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState<string>(() => (Number.isFinite(value) ? String(value) : "0"));

  useEffect(() => {
    if (!focused) {
      setText(Number.isFinite(value) ? String(value) : String(emptyFallback));
    }
  }, [value, focused, emptyFallback]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    if (text === "0" || Number(text) === 0) {
      setText("");
    } else {
      e.currentTarget.select();
    }
    onFocus?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    if (raw === "") {
      setText("");
      onValueChange(emptyFallback);
      return;
    }

    // Keep digits and a single decimal point; strip leading zeros before digits (e.g. "020" -> "20")
    raw = raw.replace(/[^\d.]/g, "");
    const dotIdx = raw.indexOf(".");
    if (dotIdx !== -1) {
      raw = raw.slice(0, dotIdx + 1) + raw.slice(dotIdx + 1).replace(/\./g, "");
    }
    raw = raw.replace(/^0+(?=\d)/, "");

    setText(raw);
    if (raw === "." || raw.endsWith(".")) {
      const parsedPartial = Number(raw.slice(0, -1) || 0);
      if (Number.isFinite(parsedPartial)) onValueChange(parsedPartial);
      return;
    }

    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      onValueChange(parsed);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    const parsed = Number(text);
    const finalVal = text.trim() === "" || !Number.isFinite(parsed) ? emptyFallback : parsed;
    setText(String(finalVal));
    onValueChange(finalVal);
    onBlur?.(e);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={rest.placeholder ?? "0"}
      {...rest}
      value={text}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

