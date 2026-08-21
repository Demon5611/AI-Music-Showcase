import { appShell } from "@/shared/theme/app-theme";

interface DeleteIconButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export function DeleteIconButton({
  label,
  disabled = false,
  onClick,
}: DeleteIconButtonProps) {
  return (
    <button
      aria-label={label}
      className={appShell.deleteIconButton}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <svg
        aria-hidden="true"
        className={appShell.deleteIcon}
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 3H15M4 7H20M18 7L17.2 19.1C17.1 20.2 16.2 21 15.1 21H8.9C7.8 21 6.9 20.2 6.8 19.1L6 7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          d="M10 11V17M14 11V17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.75"
        />
      </svg>
    </button>
  );
}
