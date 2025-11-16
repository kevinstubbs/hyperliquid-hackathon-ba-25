import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export interface SizeType {
	width: number;
	height: number;
}

export function useScreenSize(): SizeType {
	const { stdout } = useStdout() as any;
	const [size, setSize] = useState(() => ({
		width: stdout.columns,
		height: stdout.rows,
	}));

	useEffect(() => {
		const onResize = () =>
			setSize({
				width: stdout.columns,
				height: stdout.rows,
			});

		stdout.on('resize', onResize);
		return () => void stdout.off('resize', onResize);
	}, [stdout]);

	return size;
}

