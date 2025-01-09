document.addEventListener('alpine:init', () => {
	Alpine.data('fileUpload', () => ({
		dragging: false,
		file: null,
		loading: false,
		error: null,
		summary: null,
		polling: false,

		handleDrop(e) {
			e.preventDefault();
			this.dragging = false;

			const files = e.dataTransfer?.files;
			if (files?.length) {
				this.handleFile(files[0]);
			}
		},

		handleFile(file) {
			if (!file.type.startsWith('video/')) {
				this.error = 'Please upload a video file';
				return;
			}
			this.file = file;
			this.error = null;
		},

		async pollStatus(basePath) {
			this.polling = true;

			try {
				while (this.polling) {
					const response = await fetch(`/status?key=${basePath}`);
					if (!response.ok) throw new Error('Failed to check status');

					const data = await response.json();

					if (data.status === 'done') {
						this.summary = data.summary;
						this.polling = false;
						this.loading = false;
						break;
					} else if (data.status === 'error') {
						throw new Error(data.error || 'Processing failed');
					}

					// Wait 1 second before next poll
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			} catch (error) {
				this.error = error.message;
				this.polling = false;
				this.loading = false;
			}
		},

		async submitFile() {
			if (!this.file) return;

			this.loading = true;
			this.error = null;
			this.summary = null;

			const formData = new FormData();
			formData.append('file', this.file);

			try {
				const response = await fetch('/', {
					method: 'POST',
					body: formData,
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || 'Upload failed');
				}

				const result = await response.json();
				if (result.basePath) {
					this.pollStatus(result.basePath);
				} else {
					throw new Error('Invalid server response');
				}
			} catch (error) {
				this.error = error.message;
				this.loading = false;
			}
		},

		cleanup() {
			this.polling = false;
			this.file = null;
			this.error = null;
			this.summary = null;
		},
	}));
});
