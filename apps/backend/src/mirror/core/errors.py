class MirrorError(Exception):
    code: str

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class TryOnError(MirrorError):
    pass


class QuotaError(MirrorError):
    pass


class ProviderError(MirrorError):
    pass


class ValidationError(MirrorError):
    pass
