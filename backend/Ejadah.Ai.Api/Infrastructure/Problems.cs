namespace Ejadah.Ai.Api.Infrastructure;

/// <summary>One shape for bad input everywhere: a ValidationProblem keyed by field, with the Arabic message the form shows.</summary>
public static class Problems
{
    public static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    public static IResult Invalid(IDictionary<string, string[]> errors) => Results.ValidationProblem(errors);
}
