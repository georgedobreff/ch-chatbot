'use client';

export default function DisclaimerLink() {
    return (
        <button
            onClick={() => window.dispatchEvent(new Event('open-disclaimer'))}
            className="hover:underline font-bold text-sm text-left"
        >
            Disclaimer
        </button>
    );
}
