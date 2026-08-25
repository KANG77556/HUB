using System.Windows;
using System.Windows.Controls;
using SchoolWorkHub.ServerManager.ViewModels;

namespace SchoolWorkHub.ServerManager;

public partial class MainWindow : Window
{
    private readonly MainWindowViewModel _viewModel = new();

    public MainWindow()
    {
        InitializeComponent();
        DataContext = _viewModel;
    }

    private void AdminPassword_OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (sender is PasswordBox passwordBox)
        {
            _viewModel.SetAdminPassword(passwordBox.Password);
        }
    }

    private void LoginPassword_OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (sender is PasswordBox passwordBox)
        {
            _viewModel.SetLoginPassword(passwordBox.Password);
        }
    }
}
